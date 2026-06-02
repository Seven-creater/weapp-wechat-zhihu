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
  console.warn('[deletePost] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[deletePost] shared validate unavailable');
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

  const postIdCheck = validateString(event.postId, { name: 'postId', required: true, min: 8, max: 64 });
  if (!postIdCheck.ok) {
    return { success: false, error: postIdCheck.error };
  }
  const postId = postIdCheck.value;

  try {
    const callerIsAdmin = await isAdmin(openid);
    const postRes = await db.collection('posts').doc(postId).get();
    const post = postRes.data;

    if (!post || (!callerIsAdmin && post._openid !== openid)) {
      return { success: false, error: 'permission denied' };
    }

    await db.collection('posts').doc(postId).remove();
    await db.collection('comments').where({ postId }).remove();
    await db.collection('actions')
      .where(_.or([
        { type: 'like_post', targetId: postId },
        { type: 'like_post', postId: postId },
        { type: 'collect_post', targetId: postId },
        { type: 'collect_post', postId: postId }
      ]))
      .remove();

    return { success: true };
  } catch (err) {
    console.error('[deletePost] failed:', err && err.message ? err.message : err);
    return { success: false, error: err && err.message ? err.message : 'delete failed' };
  }
};
