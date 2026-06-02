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
  console.warn('[sendMessage] shared validate unavailable');
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

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function normalizeUserInfo(userInfo) {
  return {
    nickName: toSafeString(userInfo && userInfo.nickName, 64) || '未知用户',
    avatarUrl: toSafeString(userInfo && userInfo.avatarUrl, 1024) || '/images/zhi.png'
  };
}

async function fetchUserProfile(openid) {
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ userInfo: true })
    .limit(1)
    .get();
  const user = res.data && res.data[0];
  return {
    exists: !!user,
    userInfo: normalizeUserInfo(user && user.userInfo)
  };
}

async function upsertConversationTx(transaction, { ownerId, targetId, targetUserInfo, lastMessage, unreadDelta }) {
  const updateData = {
    lastMessage,
    updateTime: db.serverDate()
  };
  if (unreadDelta > 0) {
    updateData.unreadCount = _.inc(unreadDelta);
  }

  const updateRes = await transaction.collection('conversations')
    .where({ ownerId, targetId })
    .update({
      data: updateData
    });

  const updated = Number(updateRes && updateRes.stats && updateRes.stats.updated) || 0;
  if (updated > 0) return;

  await transaction.collection('conversations').add({
    data: {
      ownerId,
      targetId,
      targetUserInfo: normalizeUserInfo(targetUserInfo),
      lastMessage,
      unreadCount: unreadDelta > 0 ? unreadDelta : 0,
      updateTime: db.serverDate()
    }
  });
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
  if (!targetIdCheck.ok) return { success: false, error: targetIdCheck.error };

  const contentCheck = validateString(event.content, {
    name: 'content',
    required: true,
    min: 1,
    max: 1000
  });
  if (!contentCheck.ok) return { success: false, error: contentCheck.error };

  const targetId = targetIdCheck.value;
  const content = contentCheck.value;
  if (targetId === OPENID) {
    return { success: false, error: 'invalid targetId' };
  }

  try {
    const [senderProfile, targetProfile] = await Promise.all([
      fetchUserProfile(OPENID),
      fetchUserProfile(targetId)
    ]);

    if (!targetProfile.exists) {
      return { success: false, error: 'target not found' };
    }

    const roomId = [OPENID, targetId].sort().join('_');
    const transaction = await db.startTransaction();
    try {
      const addRes = await transaction.collection('messages').add({
        data: {
          content,
          roomId,
          createTime: db.serverDate(),
          senderId: OPENID,
          receiverId: targetId,
          userInfo: senderProfile.userInfo
        }
      });

      await upsertConversationTx(transaction, {
        ownerId: OPENID,
        targetId,
        targetUserInfo: targetProfile.userInfo,
        lastMessage: content,
        unreadDelta: 0
      });

      await upsertConversationTx(transaction, {
        ownerId: targetId,
        targetId: OPENID,
        targetUserInfo: senderProfile.userInfo,
        lastMessage: content,
        unreadDelta: 1
      });

      await transaction.commit();
      return {
        success: true,
        messageId: addRes._id,
        conversationUpdated: true
      };
    } catch (err) {
      try {
        await transaction.rollback();
      } catch (_) {}
      throw err;
    }
  } catch (err) {
    console.error('[sendMessage] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'send failed'
    };
  }
};
