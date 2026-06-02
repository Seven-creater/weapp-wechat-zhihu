const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');

const MAX_BATCH_SIZE = 50;
const CACHE_TTL_MS = 60 * 1000;
const profileCache = new Map();

exports.main = async (event = {}) => {
  try {
    const fieldMode = event.fieldMode === 'full' ? 'full' : 'basic';
    const openids = normalizeOpenids(event.openids);
    if (openids.length === 0) {
      return {
        success: true,
        data: {}
      };
    }

    const data = {};
    const misses = [];
    for (const openid of openids) {
      const cacheKey = `${openid}:${fieldMode}`;
      const cached = readCache(cacheKey);
      if (cached) {
        data[openid] = cached;
      } else {
        misses.push(openid);
      }
    }

    if (misses.length > 0) {
      const queried = await queryUsersBatch(misses, fieldMode);
      for (const openid of misses) {
        const profile = queried[openid] || defaultUser(openid, fieldMode);
        data[openid] = profile;
        writeCache(`${openid}:${fieldMode}`, profile);
      }
    }

    return {
      success: true,
      data
    };
  } catch (err) {
    console.error('[getUsersBatch] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : 'query failed',
      data: {}
    };
  }
};

function normalizeOpenids(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(
    input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_BATCH_SIZE)
  ));
}

async function queryUsersBatch(openids, fieldMode) {
  if (openids.length === 0) return {};

  const projection = {
    _openid: true,
    userInfo: true,
    userType: true,
    stats: true,
    badge: true,
    ...(fieldMode === 'full' ? {
      profile: true,
      reputation: true
    } : {})
  };

  try {
    const res = await db.collection('users')
      .where({
        _openid: _.in(openids)
      })
      .field(projection)
      .limit(openids.length)
      .get();

    const rows = Array.isArray(res.data) ? res.data : [];
    const avatarCloudIds = new Set();
    for (const row of rows) {
      const avatar = row && row.userInfo && row.userInfo.avatarUrl;
      if (media.isCloudFileId(avatar)) {
        avatarCloudIds.add(avatar);
      }
    }
    const avatarMap = await media.resolveTempUrlMap(cloud, Array.from(avatarCloudIds), {
      scenario: 'getUsersBatch.avatar'
    });

    const userMap = {};
    for (const row of rows) {
      const openid = row && row._openid ? row._openid : '';
      if (!openid) continue;
      userMap[openid] = sanitizeUser(row, openid, fieldMode, avatarMap);
    }
    return userMap;
  } catch (err) {
    console.error('[getUsersBatch] query failed:', err && err.message ? err.message : err);
    return {};
  }
}

function sanitizeUser(userData, openid, fieldMode, avatarMap = new Map()) {
  const userInfo = {
    ...(userData.userInfo || {})
  };

  if (media.isCloudFileId(userInfo.avatarUrl)) {
    userInfo.avatarUrl = avatarMap.get(userInfo.avatarUrl) || userInfo.avatarUrl;
  }
  userInfo.avatarUrl = media.normalizeAvatarUrl(userInfo.avatarUrl, '/images/zhi.png');
  if (!userInfo.nickName || !String(userInfo.nickName).trim()) {
    userInfo.nickName = '微信用户';
  }

  const base = {
    _openid: userData._openid || openid,
    userInfo,
    userType: userData.userType || 'normal',
    stats: userData.stats || {},
    badge: userData.badge || null
  };

  if (fieldMode === 'full') {
    return {
      ...base,
      profile: userData.profile || {},
      reputation: userData.reputation || null
    };
  }

  return base;
}

function defaultUser(openid, fieldMode) {
  const base = {
    _openid: openid,
    userInfo: {
      nickName: '微信用户',
      avatarUrl: '/images/zhi.png'
    },
    userType: 'normal',
    stats: {},
    badge: null
  };

  if (fieldMode === 'full') {
    return {
      ...base,
      profile: {},
      reputation: null
    };
  }

  return base;
}

function readCache(key) {
  const hit = profileCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    profileCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  profileCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}
