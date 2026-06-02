const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[deleteComment] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[deleteComment] shared validate unavailable');
}

const SUPER_ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

async function isAdmin(openid) {
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
  return !!(user && (user.isAdmin === true || (user.permissions && user.permissions.canManageUsers === true)));
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const commentIdCheck = validateString(event.commentId, { name: 'commentId', required: true, min: 8, max: 64 });
  if (!commentIdCheck.ok) {
    return { success: false, error: commentIdCheck.error };
  }
  const postIdCheck = validateString(event.postId, { name: 'postId', required: true, min: 8, max: 64 });
  if (!postIdCheck.ok) {
    return { success: false, error: postIdCheck.error };
  }

  const commentId = commentIdCheck.value;
  const postId = postIdCheck.value;

  try {
    const callerIsAdmin = await isAdmin(openid);

    const commentRes = await db.collection('comments').doc(commentId).get();
    const comment = commentRes.data;

    const commentOwner = (comment && (comment.authorOpenid || comment._openid)) || '';
    if (!comment || (!callerIsAdmin && commentOwner !== openid)) {
      return { success: false, error: 'permission denied' };
    }

    const repliesRes = await db.collection('comments').where({ parentId: commentId }).get();
    const replyIds = (repliesRes.data || []).map((item) => item._id);
    const allIds = [commentId].concat(replyIds);

    await db.collection('comments')
      .where(_.or(allIds.map((id) => ({ _id: id }))))
      .remove();

    await db.collection('actions')
      .where(_.or([
        { type: 'like_comment', targetId: _.in(allIds) },
        { type: 'like_comment', postId: _.in(allIds) }
      ]))
      .remove();

    const remainCountRes = await db.collection('comments')
      .where({ postId })
      .count();
    const commentCount = Math.max(0, remainCountRes.total || 0);

    await db.collection('posts').doc(postId).update({
      data: {
        'stats.comment': commentCount
      }
    });

    return { success: true, removed: allIds.length, commentCount };
  } catch (err) {
    console.error('[deleteComment] failed:', err && err.message ? err.message : err);
    return { success: false, error: err && err.message ? err.message : 'delete failed' };
  }
};
