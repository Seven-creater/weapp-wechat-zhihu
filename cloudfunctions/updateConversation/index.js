const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const USER_CACHE_TTL_MS = 2 * 60 * 1000;
const userCache = new Map();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      error: 'unauthorized'
    };
  }

  const action = toSafeString(event.action, 16);
  const targetId = toSafeString(event.targetId, 64);

  try {
    if (action === 'send') {
      if (!targetId) {
        return { success: false, error: 'missing targetId' };
      }
      if (targetId === openid) {
        return { success: false, error: 'invalid targetId' };
      }

      const lastMessage = toSafeString(event.lastMessage, 500);
      if (!lastMessage) {
        return { success: false, error: 'empty message' };
      }

      const senderUserInfo = await getUserInfoCached(openid);
      const targetUserInfo = normalizeUserInfo(event.targetUserInfo) || await getUserInfoCached(targetId);

      await upsertConversation({
        ownerId: openid,
        targetId,
        targetUserInfo,
        lastMessage,
        unreadDelta: 0
      });

      await upsertConversation({
        ownerId: targetId,
        targetId: openid,
        targetUserInfo: senderUserInfo,
        lastMessage,
        unreadDelta: 1
      });

      return { success: true };
    }

    if (action === 'read') {
      if (!targetId) {
        return { success: false, error: 'missing targetId' };
      }

      await db.collection('conversations').where({
        ownerId: openid,
        targetId
      }).update({
        data: {
          unreadCount: 0
        }
      });

      return { success: true };
    }

    return { success: false, error: 'unsupported action' };
  } catch (err) {
    console.error('[updateConversation] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'operation failed'
    };
  }
};

async function upsertConversation({ ownerId, targetId, targetUserInfo, lastMessage, unreadDelta }) {
  const updateData = {
    lastMessage,
    updateTime: db.serverDate()
  };
  if (unreadDelta > 0) {
    updateData.unreadCount = _.inc(unreadDelta);
  }

  const updateRes = await db.collection('conversations').where({
    ownerId,
    targetId
  }).update({
    data: updateData
  });

  const updated = Number(updateRes && updateRes.stats && updateRes.stats.updated) || 0;
  if (updated > 0) {
    return;
  }

  // No record updated: create a new conversation doc.
  await db.collection('conversations').add({
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

async function getUserInfoCached(openid) {
  const now = Date.now();
  const hit = userCache.get(openid);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ userInfo: true })
    .limit(1)
    .get();

  const userInfo = normalizeUserInfo(res.data[0] && res.data[0].userInfo);
  userCache.set(openid, {
    value: userInfo,
    expiresAt: now + USER_CACHE_TTL_MS
  });
  return userInfo;
}

function normalizeUserInfo(userInfo) {
  const name = toSafeString(userInfo && userInfo.nickName, 64) || '未知用户';
  const avatar = toSafeString(userInfo && userInfo.avatarUrl, 1024) || '/images/zhi.png';
  return {
    nickName: name,
    avatarUrl: avatar
  };
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
