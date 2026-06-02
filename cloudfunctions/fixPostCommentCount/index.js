const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[fixPostCommentCount] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[fixPostCommentCount] shared validate unavailable');
}

const SUPER_ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const callerIsAdmin = await isAdmin(OPENID);
    if (!callerIsAdmin) {
      return {
        success: false,
        error: 'permission denied'
      };
    }

    const postIdInput = event.postId == null ? '' : String(event.postId);
    if (postIdInput) {
      const postCheck = validateString(postIdInput, {
        name: 'postId',
        required: true,
        min: 8,
        max: 64
      });
      if (!postCheck.ok) {
        return {
          success: false,
          error: postCheck.error
        };
      }
      return await fixSinglePost(postCheck.value);
    }

    return await fixAllPosts();
  } catch (err) {
    console.error('[fixPostCommentCount] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'fix failed'
    };
  }
};

async function isAdmin(openid) {
  if (!openid) return false;
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    return true;
  }

  const userQuery = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();
  const user = userQuery.data && userQuery.data[0];
  return !!(user && (user.isAdmin === true || (user.permissions && user.permissions.canManageUsers === true)));
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

async function fixSinglePost(postId) {
  try {
    const commentRes = await db.collection('comments')
      .where({
        postId,
        parentId: ''
      })
      .count();

    const correctCount = commentRes.total || 0;
    await db.collection('posts')
      .doc(postId)
      .update({
        data: {
          'stats.comment': correctCount
        }
      });

    return {
      success: true,
      postId,
      commentCount: correctCount
    };
  } catch (err) {
    console.error('[fixPostCommentCount] fix one failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'fix one failed'
    };
  }
}

async function fixAllPosts() {
  try {
    const posts = await fetchAllPostIds();
    const results = [];
    for (const post of posts) {
      results.push(await fixSinglePost(post._id));
    }

    const successCount = results.filter((r) => r.success).length;
    return {
      success: true,
      total: posts.length,
      successCount,
      failedCount: posts.length - successCount,
      results
    };
  } catch (err) {
    console.error('[fixPostCommentCount] fix all failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'fix all failed'
    };
  }
}

async function fetchAllPostIds() {
  const PAGE_SIZE = 100;
  const MAX_SCAN_ROWS = 5000;
  let skip = 0;
  const rows = [];

  while (skip < MAX_SCAN_ROWS) {
    const res = await db.collection('posts')
      .field({ _id: true })
      .skip(skip)
      .limit(PAGE_SIZE)
      .get();
    const pageRows = Array.isArray(res.data) ? res.data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return rows;
}
