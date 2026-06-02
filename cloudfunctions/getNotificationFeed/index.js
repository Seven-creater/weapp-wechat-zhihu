const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');

const LIKE_TYPES = ['like_post', 'collect_post', 'like', 'collect'];
const MAX_PAGE_SIZE = 50;
const MAX_POST_IDS = 100;

let startTrace = (name, extra = {}) => ({ functionName: name, startedAt: Date.now(), extra });
let endTrace = (trace, result) => result;
let failTrace = () => {};
try {
  const metrics = require('../_shared/metrics');
  startTrace = metrics.startTrace || startTrace;
  endTrace = metrics.endTrace || endTrace;
  failTrace = metrics.failTrace || failTrace;
} catch (err) {
  console.warn('[getNotificationFeed] shared metrics unavailable');
}

exports.main = async (event = {}) => {
  const trace = startTrace('getNotificationFeed', {
    type: String(event.type || '')
  });
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return endTrace(trace, { success: false, error: 'unauthorized' });
  }

  const type = String(event.type || '').trim();
  if (type !== 'like' && type !== 'comment') {
    return endTrace(trace, { success: false, error: 'invalid type' });
  }

  const page = toPositiveInt(event.page, 1);
  const pageSize = clamp(toPositiveInt(event.pageSize, 20), 1, MAX_PAGE_SIZE);

  try {
    const postRows = await db.collection('posts')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        title: true,
        content: true,
        images: true,
        image: true,
        coverImg: true,
        imageUrl: true
      })
      .limit(MAX_POST_IDS)
      .get();

    const posts = Array.isArray(postRows.data) ? postRows.data : [];
    if (!posts.length) {
      return endTrace(trace, {
        success: true,
        data: [],
        pagination: { page, pageSize, hasMore: false }
      }, {
        rows: 0,
        hasMore: false
      });
    }

    const postIds = posts.map((p) => p._id).filter(Boolean);
    const postMap = await buildPostMapWithMedia(posts);

    const rows = await queryFeedRows(type, OPENID, postIds, page, pageSize);
    const items = rows.items || [];
    const actorIds = dedupe(items.map((item) => item.actorOpenid));
    const users = await fetchUsersWithMedia(actorIds);

    const data = items.map((item) => {
      const actor = users[item.actorOpenid] || defaultUser();
      const post = postMap[item.postId] || { postTitle: '未知帖子', postImage: '' };

      if (type === 'comment') {
        return {
          id: item.id,
          userId: item.actorOpenid,
          userName: actor.nickName,
          userAvatar: actor.avatarUrl,
          userType: actor.userType,
          commentContent: item.commentContent,
          postId: item.postId,
          postTitle: post.postTitle,
          postImage: post.postImage,
          createTime: item.createTime
        };
      }

      return {
        id: item.id,
        userId: item.actorOpenid,
        userName: actor.nickName,
        userAvatar: actor.avatarUrl,
        userType: actor.userType,
        actionText: item.actionText,
        postId: item.postId,
        postTitle: post.postTitle,
        postImage: post.postImage,
        createTime: item.createTime
      };
    });

    return endTrace(trace, {
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        hasMore: rows.hasMore
      }
    }, {
      rows: data.length,
      hasMore: rows.hasMore
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('getNotificationFeed failed:', err);
    return endTrace(trace, {
      success: false,
      error: err.message || 'query failed'
    });
  }
};

async function queryFeedRows(type, openid, postIds, page, pageSize) {
  const skip = (page - 1) * pageSize;

  if (type === 'comment') {
    const where = _.and([
      { postId: _.in(postIds) },
      { authorOpenid: _.neq(openid) },
      { _openid: _.neq(openid) }
    ]);
    const res = await db.collection('comments')
      .where(where)
      .field({
        _id: true,
        authorOpenid: true,
        _openid: true,
        postId: true,
        content: true,
        createTime: true
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize + 1)
      .get();

    const docs = Array.isArray(res.data) ? res.data : [];
    const hasMore = docs.length > pageSize;
    const pageDocs = docs.slice(0, pageSize);
    return {
      hasMore,
      items: pageDocs.map((doc) => ({
        id: doc._id,
        actorOpenid: doc.authorOpenid || doc._openid || null,
        postId: doc.postId,
        commentContent: shorten(doc.content || '评论', 120),
        createTime: doc.createTime
      }))
    };
  }

  const where = _.and([
    { type: _.in(LIKE_TYPES) },
    _.or([{ targetId: _.in(postIds) }, { postId: _.in(postIds) }]),
    { _openid: _.neq(openid) }
  ]);
  const res = await db.collection('actions')
    .where(where)
    .field({
      _id: true,
      _openid: true,
      targetId: true,
      postId: true,
      type: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize + 1)
    .get();

  const docs = Array.isArray(res.data) ? res.data : [];
  const hasMore = docs.length > pageSize;
  const pageDocs = docs.slice(0, pageSize);
  return {
    hasMore,
    items: pageDocs.map((doc) => {
      const isCollect = doc.type === 'collect_post' || doc.type === 'collect';
      return {
        id: doc._id,
        actorOpenid: doc._openid,
        postId: doc.targetId || doc.postId,
        actionText: isCollect ? '收藏了你的帖子' : '赞了你的帖子',
        createTime: doc.createTime
      };
    })
  };
}

async function fetchUsers(openids) {
  if (!openids.length) return {};
  const res = await db.collection('users')
    .where({
      _openid: _.in(openids)
    })
    .field({
      _openid: true,
      userType: true,
      userInfo: true
    })
    .limit(openids.length)
    .get();

  const map = {};
  (res.data || []).forEach((row) => {
    if (!row || !row._openid) return;
    const info = row.userInfo || {};
    map[row._openid] = {
      nickName: toSafeString(info.nickName, 64) || '微信用户',
      avatarUrl: toSafeString(info.avatarUrl, 1024) || '/images/zhi.png',
      userType: row.userType || 'normal'
    };
  });
  return map;
}

async function fetchUsersWithMedia(openids) {
  const map = await fetchUsers(openids);
  const avatarIds = new Set();
  Object.values(map).forEach((row) => {
    if (media.isCloudFileId(row.avatarUrl)) {
      avatarIds.add(row.avatarUrl);
    }
  });
  const avatarMap = await media.resolveTempUrlMap(cloud, Array.from(avatarIds), {
    scenario: 'getNotificationFeed.avatar'
  });

  const next = {};
  Object.keys(map).forEach((openid) => {
    const row = map[openid];
    let avatarUrl = row.avatarUrl;
    if (media.isCloudFileId(avatarUrl)) {
      avatarUrl = avatarMap.get(avatarUrl) || avatarUrl;
    }
    next[openid] = {
      ...row,
      avatarUrl: media.normalizeAvatarUrl(avatarUrl, '/images/zhi.png')
    };
  });
  return next;
}

async function buildPostMapWithMedia(posts) {
  const cloudIds = new Set();
  (posts || []).forEach((post) => {
    const image = media.pickImageFromDoc(post);
    if (media.isCloudFileId(image)) {
      cloudIds.add(image);
    }
  });

  const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getNotificationFeed.postImage'
  });

  const map = {};
  (posts || []).forEach((post) => {
    const rawImage = media.pickImageFromDoc(post);
    const postImage = media.isCloudFileId(rawImage)
      ? (urlMap.get(rawImage) || rawImage)
      : rawImage;
    map[post._id] = {
      postTitle: shorten(post.title || post.content || '未知帖子', 20),
      postImage: postImage || ''
    };
  });
  return map;
}

function defaultUser() {
  return {
    nickName: '微信用户',
    avatarUrl: '/images/zhi.png',
    userType: 'normal'
  };
}

function shorten(text, maxLen) {
  const value = toSafeString(text, maxLen + 3);
  if (!value) return '';
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
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
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function dedupe(list) {
  return Array.from(new Set((list || []).filter(Boolean)));
}
