const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const targetId = toSafeString(event.targetId, 64);
  if (!targetId || targetId === OPENID) {
    return { success: false, error: 'invalid targetId' };
  }

  const page = clamp(toPositiveInt(event.page, 1), 1, 1000);
  const pageSize = clamp(toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const roomId = [OPENID, targetId].sort().join('_');

  try {
    const res = await db.collection('messages')
      .where({ roomId })
      .field({
        content: true,
        createTime: true,
        senderId: true,
        userInfo: true
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize + 1)
      .get();

    const rows = Array.isArray(res.data) ? res.data : [];
    const hasMore = rows.length > pageSize;
    const data = rows.slice(0, pageSize).reverse().map((row) => ({
      _id: row._id,
      content: toSafeString(row.content, 1000),
      createTime: row.createTime || null,
      userInfo: normalizeUserInfo(row.userInfo),
      isMy: row.senderId === OPENID
    }));

    return {
      success: true,
      data,
      page,
      pageSize,
      hasMore
    };
  } catch (err) {
    console.error('[getConversationMessages] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

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
