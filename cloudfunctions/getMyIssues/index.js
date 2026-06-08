const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const type = event.type === 'posts' ? 'posts' : 'issues';
  const page = clamp(toPositiveInt(event.page, 1), 1, 1000);
  const pageSize = clamp(toPositiveInt(event.pageSize || event.limit, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  try {
    const result = type === 'posts'
      ? await queryPosts(OPENID, skip, pageSize)
      : await queryIssues(OPENID, skip, pageSize);
    return {
      success: true,
      ...result,
      page,
      pageSize
    };
  } catch (err) {
    console.error('[getMyIssues] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

async function queryIssues(openid, skip, pageSize) {
  const res = await db.collection('issues')
    .where({ _openid: openid })
    .field({
      description: true,
      imageUrl: true,
      images: true,
      status: true,
      address: true,
      formattedAddress: true,
      aiAnalysis: true,
      aiSolution: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize + 1)
    .get();
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    data: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize
  };
}

async function queryPosts(openid, skip, pageSize) {
  const res = await db.collection('posts')
    .where({ _openid: openid })
    .field({
      title: true,
      content: true,
      images: true,
      userInfo: true,
      stats: true,
      createTime: true,
      type: true,
      recognizedCategory: true,
      recognizedSubtype: true,
      recognizedSubtypes: true
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize + 1)
    .get();
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    data: rows.slice(0, pageSize).map((post) => ({
      ...post,
      userInfo: normalizeUserInfo(post.userInfo),
      stats: post.stats || { like: 0, comment: 0 }
    })),
    hasMore: rows.length > pageSize
  };
}

function normalizeUserInfo(userInfo) {
  return {
    nickName: toSafeString(userInfo && userInfo.nickName, 64) || '匿名用户',
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
