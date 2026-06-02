const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[updateUserStats] shared validate unavailable');
}

function validateString(value, options) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options && options.name ? options.name : 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

function validateEnum(value, allowed, options) {
  if (sharedValidate && typeof sharedValidate.validateEnum === 'function') {
    return sharedValidate.validateEnum(value, allowed, options);
  }
  if (!allowed.includes(value)) {
    return { ok: false, error: `invalid ${options && options.name ? options.name : 'value'}` };
  }
  return { ok: true, value };
}

function maskOpenid(openid) {
  if (typeof openid !== 'string' || openid.length < 8) return 'unknown';
  return `${openid.slice(0, 3)}***${openid.slice(-3)}`;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const followerId = wxContext.OPENID;
  const { action } = event;

  const actionCheck = validateEnum(action, ['follow', 'unfollow'], { name: 'action', required: true });
  if (!actionCheck.ok) {
    return { success: false, error: actionCheck.error };
  }

  const targetCheck = validateString(event.targetId, { name: 'targetId', required: true, min: 6, max: 64 });
  if (!targetCheck.ok) {
    return { success: false, error: targetCheck.error };
  }

  const targetId = targetCheck.value;
  if (targetId === followerId) {
    return { success: false, error: 'invalid targetId' };
  }

  try {
    if (actionCheck.value === 'follow') {
      await updateUserStat(followerId, 'followingCount', 1);
      await updateUserStat(targetId, 'followersCount', 1);
      await refreshMutual(followerId, targetId, true);
      return { success: true, message: 'ok' };
    }

    await updateUserStat(followerId, 'followingCount', -1);
    await updateUserStat(targetId, 'followersCount', -1);
    await refreshMutual(followerId, targetId, false);
    return { success: true, message: 'ok' };
  } catch (err) {
    console.error('[updateUserStats] failed:', {
      action: actionCheck.value,
      followerId: maskOpenid(followerId),
      targetId: maskOpenid(targetId),
      error: err && err.message ? err.message : String(err)
    });
    return { success: false, error: err && err.message ? err.message : 'update failed' };
  }
};

async function refreshMutual(followerId, targetId, afterFollow) {
  if (afterFollow) {
    const reverseFollow = await db.collection('follows').where({
      followerId: targetId,
      targetId: followerId
    }).limit(1).get();

    if (reverseFollow.data && reverseFollow.data.length > 0) {
      await db.collection('follows').where({
        followerId,
        targetId
      }).update({ data: { isMutual: true } });

      await db.collection('follows').where({
        followerId: targetId,
        targetId: followerId
      }).update({ data: { isMutual: true } });
    }
    return;
  }

  await db.collection('follows').where({
    followerId: targetId,
    targetId: followerId
  }).update({ data: { isMutual: false } });
}

async function updateUserStat(openid, field, increment) {
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (!userRes.data || userRes.data.length === 0) {
    return;
  }

  const user = userRes.data[0];
  const stats = user.stats || {};
  const currentValue = Number(stats[field]) || 0;
  const nextValue = Math.max(0, currentValue + increment);

  await db.collection('users').where({ _openid: openid }).update({
    data: {
      [`stats.${field}`]: nextValue
    }
  });
}
