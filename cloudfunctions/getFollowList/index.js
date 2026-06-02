// cloudfunctions/getFollowList/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');
const MAX_PAGE_SIZE = 50;
let startTrace = (name, extra = {}) => ({ functionName: name, startedAt: Date.now(), extra });
let endTrace = (trace, result) => result;
let failTrace = () => {};
try {
  const metrics = require('../_shared/metrics');
  startTrace = metrics.startTrace || startTrace;
  endTrace = metrics.endTrace || endTrace;
  failTrace = metrics.failTrace || failTrace;
} catch (err) {
  console.warn('[getFollowList] shared metrics unavailable');
}

exports.main = async (event = {}, context) => {
  const trace = startTrace('getFollowList', {
    type: String(event.type || '')
  });
  const { OPENID } = cloud.getWXContext();
  const type = String(event.type || '').trim();
  const userId = String(event.userId || '').trim();
  const page = toPositiveInt(event.page, 1);
  const pageSize = clamp(toPositiveInt(event.pageSize, 20), 1, MAX_PAGE_SIZE);
  const includeProfile = !!event.includeProfile;

  if (!OPENID) {
    return endTrace(trace, {
      success: false,
      error: 'unauthorized'
    });
  }

  const targetUserId = userId || OPENID;
  if (type !== 'following' && type !== 'followers') {
    return endTrace(trace, {
      success: false,
      error: 'invalid type'
    });
  }

  try {
    let where;
    if (type === 'following') {
      where = { _openid: targetUserId };
    } else {
      where = { targetId: targetUserId };
    }

    const query = db.collection('follows')
      .where(where)
      .orderBy('createTime', 'desc');

    const result = await query
      .skip((page - 1) * pageSize)
      .limit(pageSize + 1)
      .get();

    const rows = Array.isArray(result.data) ? result.data : [];
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);

    const relationUserIds = Array.from(new Set(
      pageRows
        .map((row) => (type === 'following' ? row.targetId : row._openid))
        .filter(Boolean)
    ));

    const [viewerFollowRes, reverseFollowRes, profileMap] = await Promise.all([
      relationUserIds.length > 0
        ? db.collection('follows')
            .where({
              _openid: OPENID,
              targetId: _.in(relationUserIds)
            })
            .field({ targetId: true })
            .get()
        : Promise.resolve({ data: [] }),
      type === 'following' && relationUserIds.length > 0
        ? db.collection('follows')
            .where({
              _openid: _.in(relationUserIds),
              targetId: OPENID
            })
            .field({ _openid: true })
            .get()
        : Promise.resolve({ data: [] }),
      includeProfile ? fetchProfilesWithMedia(relationUserIds) : Promise.resolve({})
    ]);

    const viewerFollowingSet = new Set((viewerFollowRes.data || []).map((row) => row.targetId));
    const reverseFollowingSet = new Set((reverseFollowRes.data || []).map((row) => row._openid));

    const data = pageRows.map((row) => {
      const relationUserId = type === 'following' ? row.targetId : row._openid;
      const isFollowing = viewerFollowingSet.has(relationUserId);
      const isMutual = type === 'following'
        ? reverseFollowingSet.has(relationUserId)
        : isFollowing;

      const next = {
        ...row,
        isFollowing,
        isMutual
      };

      if (includeProfile) {
        const profile = profileMap[relationUserId] || {};
        next.userInfo = profile.userInfo || {
          nickName: '微信用户',
          avatarUrl: '/images/zhi.png'
        };
        next.userType = profile.userType || 'normal';
      }

      return next;
    });

    return endTrace(trace, {
      success: true,
      data,
      count: data.length,
      pagination: {
        page,
        pageSize,
        hasMore
      }
    }, {
      rows: data.length,
      hasMore
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('getFollowList failed:', err);
    return endTrace(trace, {
      success: false,
      error: err.message || 'query failed'
    });
  }
};

async function fetchProfiles(openids) {
  if (!Array.isArray(openids) || openids.length === 0) return {};
  const res = await db.collection('users')
    .where({
      _openid: _.in(openids)
    })
    .field({
      _openid: true,
      userInfo: true,
      userType: true
    })
    .limit(openids.length)
    .get();

  const map = {};
  (res.data || []).forEach((row) => {
    if (!row || !row._openid) return;
    map[row._openid] = {
      userInfo: sanitizeUserInfo(row.userInfo),
      userType: row.userType || 'normal'
    };
  });
  return map;
}

function sanitizeUserInfo(input) {
  const userInfo = { ...(input || {}) };
  if (!userInfo.nickName || !String(userInfo.nickName).trim()) {
    userInfo.nickName = '微信用户';
  }
  if (!userInfo.avatarUrl || !String(userInfo.avatarUrl).trim()) {
    userInfo.avatarUrl = '/images/zhi.png';
  }
  return userInfo;
}

async function fetchProfilesWithMedia(openids) {
  const map = await fetchProfiles(openids);
  if (!map || Object.keys(map).length === 0) return map || {};

  const cloudIds = new Set();
  Object.values(map).forEach((profile) => {
    const avatar = profile && profile.userInfo && profile.userInfo.avatarUrl;
    if (media.isCloudFileId(avatar)) {
      cloudIds.add(avatar);
    }
  });

  const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getFollowList.avatar'
  });

  const next = {};
  Object.keys(map).forEach((openid) => {
    const profile = map[openid] || {};
    const userInfo = { ...(profile.userInfo || {}) };
    if (media.isCloudFileId(userInfo.avatarUrl)) {
      userInfo.avatarUrl = urlMap.get(userInfo.avatarUrl) || userInfo.avatarUrl;
    }
    userInfo.avatarUrl = media.normalizeAvatarUrl(userInfo.avatarUrl, '/images/zhi.png');
    next[openid] = {
      ...profile,
      userInfo
    };
  });

  return next;
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
