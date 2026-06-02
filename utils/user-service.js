const DEFAULT_USER_INFO = Object.freeze({
  nickName: 'User',
  avatarUrl: '/images/zhi.png',
});

const DEFAULT_USER_RECORD = Object.freeze({
  _openid: '',
  userInfo: DEFAULT_USER_INFO,
  userType: 'normal',
  badge: null,
  profile: {},
  reputation: null,
  phoneNumber: '',
  stats: {},
});

const CACHE_TTL = 5 * 60 * 1000;

const profileCache = new Map();
const pendingRequests = new Map();

function cloneDefaultRecord(openid = '') {
  return {
    ...DEFAULT_USER_RECORD,
    _openid: openid,
    userInfo: { ...DEFAULT_USER_INFO },
    profile: {},
    stats: {},
  };
}

function normalizeUserInfo(userInfo = {}) {
  const avatarUrl = typeof userInfo.avatarUrl === 'string' && userInfo.avatarUrl.trim()
    ? userInfo.avatarUrl
    : DEFAULT_USER_INFO.avatarUrl;

  return {
    ...DEFAULT_USER_INFO,
    ...userInfo,
    avatarUrl,
  };
}

function normalizeUserRecord(result, openid) {
  const fallback = cloneDefaultRecord(openid);
  const payload = result && result.success ? (result.data || {}) : {};

  return {
    ...fallback,
    ...payload,
    _openid: payload._openid || openid,
    userInfo: normalizeUserInfo(payload.userInfo),
    profile: payload.profile || {},
    stats: payload.stats || {},
    userType: payload.userType || fallback.userType,
    badge: payload.badge || null,
    reputation: payload.reputation || null,
    phoneNumber: payload.phoneNumber || '',
  };
}

function readCache(openid) {
  const cached = profileCache.get(openid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    profileCache.delete(openid);
    return null;
  }
  return cached.value;
}

function writeCache(openid, value) {
  profileCache.set(openid, {
    value,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

function fetchUserProfile(openid) {
  return wx.cloud.callFunction({
    name: 'getUserInfo',
    data: { targetId: openid },
  }).then((res) => normalizeUserRecord(res.result, openid))
    .catch(() => cloneDefaultRecord(openid));
}

function getUserProfile(openid, options = {}) {
  const userId = typeof openid === 'string' ? openid.trim() : '';
  if (!userId) {
    return Promise.resolve(cloneDefaultRecord(''));
  }

  if (!options.forceRefresh) {
    const cached = readCache(userId);
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  const pending = pendingRequests.get(userId);
  if (pending) {
    return pending;
  }

  const request = fetchUserProfile(userId)
    .then((profile) => {
      writeCache(userId, profile);
      pendingRequests.delete(userId);
      return profile;
    })
    .catch((err) => {
      pendingRequests.delete(userId);
      throw err;
    });

  pendingRequests.set(userId, request);
  return request;
}

function getUserProfiles(openids, options = {}) {
  const userIds = Array.from(new Set((openids || [])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)));

  if (userIds.length === 0) {
    return Promise.resolve({});
  }

  return Promise.all(userIds.map((userId) => getUserProfile(userId, options)))
    .then((profiles) => profiles.reduce((acc, profile) => {
      acc[profile._openid] = profile;
      return acc;
    }, {}));
}

function clearUserProfileCache(openid) {
  if (openid) {
    profileCache.delete(openid);
    pendingRequests.delete(openid);
    return;
  }

  profileCache.clear();
  pendingRequests.clear();
}

module.exports = {
  getUserProfile,
  getUserProfiles,
  clearUserProfileCache,
};
