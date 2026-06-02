const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');
const LIKE_TYPES = ['like_post', 'collect_post', 'like', 'collect'];
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
  console.warn('[getNotificationSummary] shared metrics unavailable');
}

exports.main = async (event = {}) => {
  const trace = startTrace('getNotificationSummary');
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return endTrace(trace, { success: false, error: 'unauthorized' });
  }

  try {
    const lastRead = sanitizeLastRead(event.lastRead || {});
    const postIds = await fetchMyPostIds(OPENID);

    const [like, comment, follow] = await Promise.all([
      queryLikeSummary(OPENID, postIds, lastRead.like),
      queryCommentSummary(OPENID, postIds, lastRead.comment),
      queryFollowSummary(OPENID, lastRead.follow)
    ]);

    const actorIds = dedupe([
      like.latest && like.latest.actorOpenid,
      comment.latest && comment.latest.actorOpenid,
      follow.latest && follow.latest.actorOpenid
    ]);
    const users = await fetchUsers(actorIds);

    hydrateActor(like.latest, users);
    hydrateActor(comment.latest, users);
    hydrateActor(follow.latest, users);

    return endTrace(trace, {
      success: true,
      data: {
        like,
        comment,
        follow,
        system: {
          total: 0,
          unread: 0,
          latest: null,
          preview: '暂无系统通知'
        }
      }
    }, {
      likeTotal: like.total || 0,
      commentTotal: comment.total || 0,
      followTotal: follow.total || 0
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('getNotificationSummary failed:', err);
    return endTrace(trace, {
      success: false,
      error: err.message || 'query failed'
    });
  }
};

async function fetchMyPostIds(openid) {
  const res = await db.collection('posts')
    .where({ _openid: openid })
    .field({ _id: true })
    .limit(MAX_POST_IDS)
    .get();
  return (res.data || []).map((row) => row._id).filter(Boolean);
}

async function queryLikeSummary(openid, postIds, lastReadAt) {
  if (!postIds.length) {
    return { total: 0, unread: 0, latest: null };
  }

  const baseWhere = _.and([
    { type: _.in(LIKE_TYPES) },
    _.or([{ targetId: _.in(postIds) }, { postId: _.in(postIds) }]),
    { _openid: _.neq(openid) }
  ]);

  const [countRes, latestRes, unreadRes] = await Promise.all([
    db.collection('actions').where(baseWhere).count(),
    db.collection('actions').where(baseWhere)
      .field({
        _id: true,
        createTime: true,
        type: true,
        targetId: true,
        postId: true,
        _openid: true
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get(),
    lastReadAt
      ? db.collection('actions').where(_.and([baseWhere, { createTime: _.gt(lastReadAt) }])).count()
      : Promise.resolve(null)
  ]);

  const latest = (latestRes.data || [])[0];
  const total = countRes.total || 0;
  return {
    total,
    unread: lastReadAt ? (unreadRes && unreadRes.total) || 0 : total,
    latest: latest ? {
      id: latest._id,
      createTime: latest.createTime,
      type: latest.type,
      postId: latest.targetId || latest.postId,
      actorOpenid: latest._openid
    } : null
  };
}

async function queryCommentSummary(openid, postIds, lastReadAt) {
  if (!postIds.length) {
    return { total: 0, unread: 0, latest: null };
  }

  const baseWhere = _.and([
    { postId: _.in(postIds) },
    { authorOpenid: _.neq(openid) },
    { _openid: _.neq(openid) }
  ]);

  const [countRes, latestRes, unreadRes] = await Promise.all([
    db.collection('comments').where(baseWhere).count(),
    db.collection('comments').where(baseWhere)
      .field({
        _id: true,
        createTime: true,
        postId: true,
        authorOpenid: true,
        _openid: true,
        content: true
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get(),
    lastReadAt
      ? db.collection('comments').where(_.and([baseWhere, { createTime: _.gt(lastReadAt) }])).count()
      : Promise.resolve(null)
  ]);

  const latest = (latestRes.data || [])[0];
  const total = countRes.total || 0;
  const latestActorOpenid = latest
    ? (latest.authorOpenid || latest._openid || '')
    : '';
  const latestIsSelf = !!latestActorOpenid && latestActorOpenid === openid;
  const safeLatest = latestIsSelf ? null : latest;
  const safeLatestActorOpenid = latestIsSelf ? '' : latestActorOpenid;
  return {
    total,
    unread: lastReadAt ? (unreadRes && unreadRes.total) || 0 : total,
    latest: safeLatest ? {
      id: safeLatest._id,
      createTime: safeLatest.createTime,
      postId: safeLatest.postId,
      actorOpenid: safeLatestActorOpenid || null,
      content: toSafeString(safeLatest.content, 120)
    } : null
  };
}

async function queryFollowSummary(openid, lastReadAt) {
  const baseWhere = { targetId: openid };
  const [countRes, latestRes, unreadRes] = await Promise.all([
    db.collection('follows').where(baseWhere).count(),
    db.collection('follows').where(baseWhere)
      .field({
        _id: true,
        createTime: true,
        followerId: true,
        _openid: true
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get(),
    lastReadAt
      ? db.collection('follows').where({
          targetId: openid,
          createTime: _.gt(lastReadAt)
        }).count()
      : Promise.resolve(null)
  ]);

  const latest = (latestRes.data || [])[0];
  const total = countRes.total || 0;
  return {
    total,
    unread: lastReadAt ? (unreadRes && unreadRes.total) || 0 : total,
    latest: latest ? {
      id: latest._id,
      createTime: latest.createTime,
      actorOpenid: latest.followerId || latest._openid
    } : null
  };
}

function sanitizeLastRead(raw) {
  return {
    like: toDate(raw.like),
    comment: toDate(raw.comment),
    follow: toDate(raw.follow)
  };
}

function toDate(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

async function fetchUsers(openids) {
  if (!openids.length) return {};
  const res = await db.collection('users')
    .where({ _openid: _.in(openids) })
    .field({
      _openid: true,
      userType: true,
      userInfo: true
    })
    .limit(openids.length)
    .get();

  const avatarCloudIds = new Set();
  (res.data || []).forEach((row) => {
    const avatar = row && row.userInfo && row.userInfo.avatarUrl;
    if (media.isCloudFileId(avatar)) {
      avatarCloudIds.add(avatar);
    }
  });
  const avatarMap = await media.resolveTempUrlMap(cloud, Array.from(avatarCloudIds), {
    scenario: 'getNotificationSummary.avatar'
  });

  const map = {};
  (res.data || []).forEach((row) => {
    if (!row || !row._openid) return;
    const info = row.userInfo || {};
    map[row._openid] = {
      actorName: toSafeString(info.nickName, 64) || '微信用户',
      actorAvatar: media.normalizeAvatarUrl(
        media.isCloudFileId(toSafeString(info.avatarUrl, 1024))
          ? (avatarMap.get(toSafeString(info.avatarUrl, 1024)) || toSafeString(info.avatarUrl, 1024))
          : toSafeString(info.avatarUrl, 1024),
        '/images/zhi.png'
      ),
      actorUserType: row.userType || 'normal'
    };
  });
  return map;
}

function hydrateActor(latest, users) {
  if (!latest || !latest.actorOpenid) return;
  const profile = users[latest.actorOpenid];
  if (!profile) return;
  latest.actorName = profile.actorName;
  latest.actorAvatar = profile.actorAvatar;
  latest.actorUserType = profile.actorUserType;
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function dedupe(list) {
  return Array.from(new Set((list || []).filter(Boolean)));
}
