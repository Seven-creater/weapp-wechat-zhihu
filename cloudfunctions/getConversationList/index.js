const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const page = clamp(toPositiveInt(event.page, 1), 1, 1000);
  const pageSize = clamp(toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  try {
    const res = await db.collection('conversations')
      .where({ ownerId: OPENID })
      .field({
        targetId: true,
        targetUserInfo: true,
        lastMessage: true,
        unreadCount: true,
        updateTime: true
      })
      .orderBy('updateTime', 'desc')
      .skip(skip)
      .limit(pageSize + 1)
      .get();

    const rows = Array.isArray(res.data) ? res.data : [];
    const hasMore = rows.length > pageSize;
    const data = rows.slice(0, pageSize);
    const targetIds = Array.from(new Set(data.map((item) => item.targetId).filter(Boolean)));
    const userMap = await fetchUsers(targetIds);

    return {
      success: true,
      data: data.map((item) => {
        const user = userMap[item.targetId] || {};
        const info = user.userInfo || item.targetUserInfo || {};
        return {
          id: item.targetId,
          targetId: item.targetId,
          name: toSafeString(info.nickName, 64) || '未知用户',
          avatar: toSafeString(info.avatarUrl, 1024) || '/images/zhi.png',
          userType: toSafeString(user.userType, 32) || 'normal',
          preview: toSafeString(item.lastMessage, 120) || '暂无消息',
          unread: Number(item.unreadCount || 0),
          updateTime: item.updateTime || null
        };
      }),
      page,
      pageSize,
      hasMore
    };
  } catch (err) {
    console.error('[getConversationList] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

async function fetchUsers(openids) {
  if (!openids.length) return {};
  const res = await db.collection('users')
    .where({ _openid: _.in(openids) })
    .field({ _openid: true, userInfo: true, userType: true })
    .limit(openids.length)
    .get();
  return (res.data || []).reduce((acc, row) => {
    acc[row._openid] = {
      userInfo: normalizeUserInfo(row.userInfo),
      userType: row.userType || 'normal'
    };
    return acc;
  }, {});
}

function normalizeUserInfo(userInfo) {
  return {
    nickName: toSafeString(userInfo && userInfo.nickName, 64) || '未知用户',
    avatarUrl: toSafeString(userInfo && userInfo.avatarUrl, 1024) || '/images/zhi.png'
  };
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
