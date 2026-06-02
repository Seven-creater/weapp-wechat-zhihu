const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const media = require('./media');

const CACHE_TTL_MS = 60 * 1000;
const profileCache = new Map();
const inflight = new Map();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const targetId = toSafeString(event.targetId, 64);
  const fieldMode = event.fieldMode === 'full' ? 'full' : 'basic';
  const includeSensitive = event.includeSensitive === true;
  const allowSensitive = includeSensitive && !!OPENID && targetId === OPENID;

  if (!targetId) {
    return {
      success: false,
      error: 'missing targetId'
    };
  }

  const cacheKey = `${targetId}:${fieldMode}:${allowSensitive ? '1' : '0'}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey);
  }

  const request = queryUserProfile(targetId, fieldMode, allowSensitive)
    .then((result) => {
      if (result && result.success) {
        writeCache(cacheKey, result);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, request);
  return request;
};

async function queryUserProfile(targetId, fieldMode, allowSensitive) {
  try {
    const projection = getProjection(fieldMode, allowSensitive);
    const res = await db.collection('users')
      .where({ _openid: targetId })
      .field(projection)
      .limit(1)
      .get();

    const userData = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
    if (!userData) {
      return {
        success: false,
        error: 'user not found'
      };
    }

    const userInfo = {
      ...(userData.userInfo || {})
    };
    const profile = fieldMode === 'full' ? (userData.profile || {}) : {};
    const reputation = fieldMode === 'full' ? (userData.reputation || null) : null;
    const badge = userData.badge || null;

    const cloudIds = media.collectCloudFileIdsDeep([userInfo, profile, badge], new Set(), {
      maxScan: 120
    });
    const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
      scenario: 'getUserInfo'
    });

    const safeUserInfo = media.replaceCloudUrlsDeep(userInfo, urlMap, { maxDepth: 4 });
    safeUserInfo.avatarUrl = media.normalizeAvatarUrl(safeUserInfo.avatarUrl, '/images/zhi.png');

    const safeProfile = media.replaceCloudUrlsDeep(profile, urlMap, { maxDepth: 4 });
    const safeBadge = media.replaceCloudUrlsDeep(badge, urlMap, { maxDepth: 4 });

    const data = {
      userInfo: safeUserInfo,
      stats: userData.stats || {},
      userType: userData.userType || 'normal',
      badge: safeBadge,
      profile: safeProfile,
      reputation,
      phoneNumber: allowSensitive ? (userData.phoneNumber || null) : null,
      _openid: userData._openid || targetId
    };

    return {
      success: true,
      data,
      // Backward compatible top-level fields.
      userInfo: data.userInfo,
      _openid: data._openid,
      stats: data.stats
    };
  } catch (err) {
    console.error('[getUserInfo] query failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'query failed'
    };
  }
}

function getProjection(fieldMode, allowSensitive) {
  const base = {
    userInfo: true,
    stats: true,
    userType: true,
    badge: true,
    _openid: true
  };

  if (fieldMode === 'basic') {
    return base;
  }

  return {
    ...base,
    profile: true,
    reputation: true,
    ...(allowSensitive ? { phoneNumber: true } : {})
  };
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

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
