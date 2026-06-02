const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[repairPostCommentStats] shared auth unavailable');
}

const SUPER_ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGE_SIZE = 200;
const MAX_MAX_PAGES = 500;
const MAX_CHANGE_DETAILS = 200;

function normalizePositiveInt(value, defaultValue, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultValue;
  const intValue = Math.floor(num);
  if (intValue < min) return min;
  if (intValue > max) return max;
  return intValue;
}

function normalizeCount(value) {
  return Math.max(0, Number(value) || 0);
}

async function isAdmin(openid) {
  if (!openid) return false;
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    return true;
  }

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();

  const user = userRes.data && userRes.data[0];
  return !!(user && (
    user.isAdmin === true ||
    (user.permissions && user.permissions.canManageUsers === true)
  ));
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const callerIsAdmin = await isAdmin(OPENID);
  if (!callerIsAdmin) {
    return {
      success: false,
      error: 'permission denied'
    };
  }

  const dryRun = event.dryRun !== false;
  const pageSize = normalizePositiveInt(event.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const maxPages = normalizePositiveInt(event.maxPages, DEFAULT_MAX_PAGES, 1, MAX_MAX_PAGES);

  const summary = {
    scannedPosts: 0,
    mismatchedPosts: 0,
    updatedPosts: 0,
    unchangedPosts: 0,
    failedPosts: 0,
    pagesScanned: 0
  };
  const changes = [];

  let page = 0;
  let skip = 0;

  while (page < maxPages) {
    let postsRes;
    try {
      postsRes = await db.collection('posts')
        .field({ _id: true, stats: true })
        .skip(skip)
        .limit(pageSize)
        .get();
    } catch (err) {
      console.error('[repairPostCommentStats] scan page failed:', err && err.message ? err.message : err);
      return {
        success: false,
        error: err && err.message ? err.message : 'scan failed',
        dryRun,
        pageSize,
        maxPages,
        summary
      };
    }

    const posts = Array.isArray(postsRes.data) ? postsRes.data : [];
    if (!posts.length) {
      break;
    }

    summary.pagesScanned += 1;

    for (const post of posts) {
      summary.scannedPosts += 1;
      const postId = post && post._id;
      if (!postId) {
        summary.failedPosts += 1;
        continue;
      }

      try {
        const countRes = await db.collection('comments')
          .where({ postId })
          .count();

        const actualCount = normalizeCount(countRes.total);
        const storedCount = normalizeCount(post && post.stats && post.stats.comment);

        if (actualCount === storedCount) {
          summary.unchangedPosts += 1;
          continue;
        }

        summary.mismatchedPosts += 1;
        if (changes.length < MAX_CHANGE_DETAILS) {
          changes.push({
            postId,
            from: storedCount,
            to: actualCount
          });
        }

        if (dryRun) {
          continue;
        }

        await db.collection('posts').doc(postId).update({
          data: {
            'stats.comment': actualCount
          }
        });
        summary.updatedPosts += 1;
      } catch (err) {
        summary.failedPosts += 1;
        console.error('[repairPostCommentStats] repair post failed:', postId, err && err.message ? err.message : err);
      }
    }

    if (posts.length < pageSize) {
      break;
    }

    page += 1;
    skip += pageSize;
  }

  return {
    success: true,
    dryRun,
    pageSize,
    maxPages,
    summary,
    changes,
    truncatedChanges: Math.max(0, summary.mismatchedPosts - changes.length)
  };
};
