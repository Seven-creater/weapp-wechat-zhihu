const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const MAX_TARGET_ID_LEN = 64;
const MAX_LIKE_POST_SCAN = 500;
const POST_BATCH_SIZE = 100;

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const callerOpenid = wxContext.OPENID || '';
    const targetId = toSafeString(event.targetId || callerOpenid, MAX_TARGET_ID_LEN);
    if (!targetId) return fail('missing targetId');

    const [followingRes, followersRes, isFollowingRes, likeStats] = await Promise.all([
      countFollowing(targetId),
      db.collection('follows').where({ targetId }).count(),
      countIsFollowing(callerOpenid, targetId),
      countPostLikes(targetId)
    ]);

    return {
      success: true,
      data: {
        following: followingRes.total || 0,
        followers: followersRes.total || 0,
        likes: likeStats.likes,
        isFollowing: isFollowingRes > 0,
        truncated: likeStats.truncated,
        scannedPosts: likeStats.scannedPosts
      }
    };
  } catch (err) {
    console.error('[getUserPublicStats] failed:', safeMessage(err));
    return fail('query failed');
  }
};

function countFollowing(targetId) {
  return db.collection('follows')
    .where(_.or([
      { followerId: targetId },
      { _openid: targetId }
    ]))
    .count();
}

async function countIsFollowing(callerOpenid, targetId) {
  if (!callerOpenid || callerOpenid === targetId) return 0;
  const res = await db.collection('follows')
    .where(_.or([
      { followerId: callerOpenid, targetId },
      { _openid: callerOpenid, targetId }
    ]))
    .count();
  return res.total || 0;
}

async function countPostLikes(targetId) {
  let likes = 0;
  let scannedPosts = 0;
  let hasMore = true;

  while (hasMore && scannedPosts < MAX_LIKE_POST_SCAN) {
    const limit = Math.min(POST_BATCH_SIZE, MAX_LIKE_POST_SCAN - scannedPosts);
    const res = await db.collection('posts')
      .where({ _openid: targetId })
      .field({ stats: true, _id: true })
      .skip(scannedPosts)
      .limit(limit)
      .get();
    const rows = Array.isArray(res.data) ? res.data : [];
    rows.forEach((post) => {
      const value = post && post.stats && typeof post.stats.like === 'number'
        ? post.stats.like
        : 0;
      likes += value;
    });
    scannedPosts += rows.length;
    hasMore = rows.length === limit;
  }

  return {
    likes,
    scannedPosts,
    truncated: scannedPosts >= MAX_LIKE_POST_SCAN && hasMore
  };
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > maxLen) return '';
  return text;
}

function safeMessage(err) {
  if (!err) return 'unknown';
  return err.message || String(err).slice(0, 120);
}

function fail(error) {
  return { success: false, error };
}
