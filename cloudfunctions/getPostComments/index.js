const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const media = require('./media');

const MAX_COMMENTS = 100;
const DEFAULT_USER_INFO = {
  nickName: '微信用户',
  avatarUrl: '/images/zhi.png'
};

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function fail(error) {
  return { success: false, error };
}

function getAuthorOpenid(comment) {
  return (comment && (comment.authorOpenid || comment._openid)) || '';
}

function normalizeUserInfo(userInfo, avatarMap = new Map()) {
  const source = userInfo && typeof userInfo === 'object' ? userInfo : {};
  let avatarUrl = media.normalizeAvatarUrl(source.avatarUrl, DEFAULT_USER_INFO.avatarUrl);
  if (media.isCloudFileId(avatarUrl)) {
    avatarUrl = avatarMap.get(avatarUrl) || avatarUrl;
  }
  return {
    nickName: toSafeString(source.nickName, 64) || DEFAULT_USER_INFO.nickName,
    avatarUrl
  };
}

function formatTime(date) {
  if (!date) return '';

  let target;
  if (date instanceof Date) {
    target = date;
  } else if (typeof date === 'number') {
    target = new Date(date);
  } else if (typeof date === 'string') {
    target = new Date(date);
  } else if (date.$date) {
    target = new Date(date.$date);
  } else {
    return '';
  }

  if (!target || Number.isNaN(target.getTime())) return '';
  const now = new Date();
  const diff = now - target;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  if (year === now.getFullYear()) return `${month}-${day}`;
  return `${year}-${month}-${day}`;
}

async function queryCallerAccess(openid) {
  if (!openid) return { isAdmin: false };
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();
  const user = Array.isArray(userRes.data) ? userRes.data[0] : null;
  const permissions = user && user.permissions ? user.permissions : {};
  return {
    isAdmin: !!(user && (user.isAdmin === true || permissions.canManageUsers === true))
  };
}

async function queryUserProfiles(openids) {
  const ids = Array.from(new Set((openids || []).filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return new Map();

  const res = await db.collection('users')
    .where({ _openid: _.in(ids) })
    .field({ _openid: true, userInfo: true, userType: true })
    .limit(ids.length)
    .get();

  const rows = Array.isArray(res.data) ? res.data : [];
  const avatarIds = rows
    .map((row) => row && row.userInfo && row.userInfo.avatarUrl)
    .filter(media.isCloudFileId);
  const avatarMap = await media.resolveTempUrlMap(cloud, avatarIds);

  const profiles = new Map();
  rows.forEach((row) => {
    if (!row || !row._openid) return;
    profiles.set(row._openid, {
      userInfo: normalizeUserInfo(row.userInfo, avatarMap),
      userType: row.userType || 'normal'
    });
  });
  return profiles;
}

async function queryLikedSet(openid, commentIds) {
  if (!openid || !Array.isArray(commentIds) || commentIds.length === 0) {
    return new Set();
  }

  const res = await db.collection('actions')
    .where(_.and([
      { _openid: openid },
      { type: _.in(['like_comment', 'like']) },
      _.or([{ targetId: _.in(commentIds) }, { postId: _.in(commentIds) }])
    ]))
    .field({ targetId: true, postId: true })
    .limit(100)
    .get();

  const liked = new Set();
  (res.data || []).forEach((row) => {
    if (row.targetId && commentIds.includes(row.targetId)) liked.add(row.targetId);
    if (row.postId && commentIds.includes(row.postId)) liked.add(row.postId);
  });
  return liked;
}

function buildTree(comments, profiles, likedSet, openid, isAdmin) {
  const commentById = new Map();
  comments.forEach((item) => {
    if (item && item._id) commentById.set(item._id, item);
  });

  function resolveRootParentId(comment) {
    let parentId = comment && comment.parentId;
    let guard = 0;
    while (parentId && guard < 10) {
      const parent = commentById.get(parentId);
      if (!parent) return '';
      if (!parent.parentId) return parent._id;
      parentId = parent.parentId;
      guard += 1;
    }
    return '';
  }

  const mainComments = [];
  const repliesMap = {};

  comments.forEach((source) => {
    const authorOpenid = getAuthorOpenid(source);
    const profile = profiles.get(authorOpenid) || {};
    const item = {
      _id: source._id,
      _openid: authorOpenid,
      authorOpenid,
      postId: source.postId || '',
      parentId: source.parentId || '',
      content: toSafeString(source.content, 1000),
      createTime: formatTime(source.createTime),
      isOwner: !!(openid && authorOpenid === openid),
      canDelete: !!((openid && authorOpenid === openid) || isAdmin),
      likes: Math.max(0, Number(source.likes || source.likeCount || 0)),
      likeCount: Math.max(0, Number(source.likeCount || source.likes || 0)),
      liked: likedSet.has(source._id),
      userInfo: profile.userInfo || normalizeUserInfo(source.userInfo),
      userType: profile.userType || source.userType || 'normal'
    };

    if (!item.parentId) {
      item.replies = [];
      mainComments.push(item);
      return;
    }

    const rootParentId = resolveRootParentId(source);
    if (!rootParentId) {
      item.parentId = '';
      item.replies = [];
      mainComments.push(item);
      return;
    }

    item.parentId = rootParentId;
    if (!repliesMap[rootParentId]) repliesMap[rootParentId] = [];
    repliesMap[rootParentId].push(item);
  });

  mainComments.forEach((item) => {
    if (repliesMap[item._id]) {
      item.replies = repliesMap[item._id];
    }
  });

  const mainIdSet = new Set(mainComments.map((item) => item && item._id).filter(Boolean));
  Object.keys(repliesMap).forEach((rootId) => {
    if (mainIdSet.has(rootId)) return;
    (repliesMap[rootId] || []).forEach((reply) => {
      reply.parentId = '';
      reply.replies = [];
      mainComments.push(reply);
    });
  });

  return mainComments;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const postId = toSafeString(event.postId, 64);
  if (!postId) return fail('missing postId');

  try {
    const postRes = await db.collection('posts')
      .where({ _id: postId })
      .field({ _id: true })
      .limit(1)
      .get();
    const post = Array.isArray(postRes.data) ? postRes.data[0] : null;
    if (!post || !post._id) {
      return fail('post not found');
    }

    const [commentsRes, countRes, callerAccess] = await Promise.all([
      db.collection('comments')
        .where({ postId })
        .field({
          _id: true,
          postId: true,
          content: true,
          parentId: true,
          likes: true,
          likeCount: true,
          createTime: true,
          authorOpenid: true,
          _openid: true,
          userInfo: true,
          userType: true
        })
        .orderBy('createTime', 'desc')
        .limit(MAX_COMMENTS)
        .get(),
      db.collection('comments').where({ postId }).count(),
      queryCallerAccess(OPENID)
    ]);

    const comments = Array.isArray(commentsRes.data) ? commentsRes.data : [];
    if (comments.length === 0) {
      return {
        success: true,
        data: {
          comments: [],
          total: Math.max(0, countRes.total || 0),
          truncated: false
        }
      };
    }

    const commentIds = comments.map((item) => item && item._id).filter(Boolean);
    const authorOpenids = comments.map(getAuthorOpenid).filter(Boolean);
    const [profiles, likedSet] = await Promise.all([
      queryUserProfiles(authorOpenids),
      queryLikedSet(OPENID, commentIds)
    ]);

    return {
      success: true,
      data: {
        comments: buildTree(comments, profiles, likedSet, OPENID, callerAccess.isAdmin),
        total: Math.max(0, countRes.total || 0),
        truncated: (countRes.total || 0) > comments.length
      }
    };
  } catch (err) {
    console.error('[getPostComments] failed:', err && err.message ? err.message : err);
    return fail('query failed');
  }
};
