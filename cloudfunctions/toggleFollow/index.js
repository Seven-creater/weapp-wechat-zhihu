const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[toggleFollow] shared validate unavailable');
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  const { name = 'value', required = false, min = 0, max = 2000 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length < min) return { ok: false, error: `${name} too short` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

function validateEnum(value, allowed, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateEnum === 'function') {
    return sharedValidate.validateEnum(value, allowed, options);
  }
  if (!allowed.includes(value)) {
    return { ok: false, error: `invalid ${options.name || 'value'}` };
  }
  return { ok: true, value };
}

async function syncFollowStatsTx(transaction, followerId, targetId) {
  const legacyOrNewFollowerWhere = _.or([
    { followerId },
    { _openid: followerId }
  ]);
  const [followingCountRes, followersCountRes] = await Promise.all([
    transaction.collection('follows').where(legacyOrNewFollowerWhere).count(),
    transaction.collection('follows').where({ targetId }).count()
  ]);

  const followingCount = Math.max(0, followingCountRes.total || 0);
  const followersCount = Math.max(0, followersCountRes.total || 0);

  await Promise.all([
    transaction.collection('users')
      .where({ _openid: followerId })
      .update({
        data: {
          'stats.followingCount': followingCount,
          updateTime: db.serverDate()
        }
      }),
    transaction.collection('users')
      .where({ _openid: targetId })
      .update({
        data: {
          'stats.followersCount': followersCount,
          updateTime: db.serverDate()
        }
      })
  ]);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, error: 'unauthorized' };
  }

  const targetIdCheck = validateString(event.targetId, {
    name: 'targetId',
    required: true,
    min: 8,
    max: 64
  });
  if (!targetIdCheck.ok) {
    return { success: false, error: targetIdCheck.error };
  }

  const actionCheck = validateEnum(event.action, ['follow', 'unfollow'], {
    name: 'action',
    required: true
  });
  if (!actionCheck.ok) {
    return { success: false, error: actionCheck.error };
  }

  const targetId = targetIdCheck.value;
  const action = actionCheck.value;
  if (OPENID === targetId) {
    return { success: false, error: 'cannot follow self' };
  }

  const transaction = await db.startTransaction();
  try {
    if (action === 'follow') {
      const existingFollow = await transaction.collection('follows')
        .where(_.or([
          { followerId: OPENID, targetId },
          { _openid: OPENID, targetId }
        ]))
        .get();

      if ((existingFollow.data || []).length > 0) {
        await transaction.rollback();
        return {
          success: true,
          action: 'follow',
          already: true,
          isMutual: !!((existingFollow.data || [])[0] && (existingFollow.data || [])[0].isMutual)
        };
      }

      await transaction.collection('follows').add({
        data: {
          followerId: OPENID,
          targetId,
          isMutual: false,
          createTime: db.serverDate()
        }
      });

      const reverseFollow = await transaction.collection('follows')
        .where({
          followerId: targetId,
          targetId: OPENID
        })
        .get();

      const isMutual = (reverseFollow.data || []).length > 0;
      if (isMutual) {
        await Promise.all([
          transaction.collection('follows')
            .where({
              followerId: OPENID,
              targetId
            })
            .update({
              data: { isMutual: true }
            }),
          transaction.collection('follows')
            .where({
              followerId: targetId,
              targetId: OPENID
            })
            .update({
              data: { isMutual: true }
            })
        ]);
      }

      await syncFollowStatsTx(transaction, OPENID, targetId);
      await transaction.commit();

      return {
        success: true,
        action: 'follow',
        isMutual
      };
    }

    const followRes = await transaction.collection('follows')
      .where(_.or([
        { followerId: OPENID, targetId },
        { _openid: OPENID, targetId }
      ]))
      .get();
    const followDocs = (followRes.data || []).filter((doc) => doc && doc._id);
    if (!followDocs.length) {
      await transaction.rollback();
      return {
        success: true,
        action: 'unfollow',
        already: true
      };
    }

    await Promise.all(followDocs.map((doc) =>
      transaction.collection('follows').doc(doc._id).remove()
    ));

    await transaction.collection('follows')
      .where({
        followerId: targetId,
        targetId: OPENID
      })
      .update({
        data: { isMutual: false }
      });

    await syncFollowStatsTx(transaction, OPENID, targetId);
    await transaction.commit();

    return {
      success: true,
      action: 'unfollow'
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('[toggleFollow] rollback failed:', rollbackErr);
    }
    console.error('[toggleFollow] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'toggle follow failed'
    };
  }
};
