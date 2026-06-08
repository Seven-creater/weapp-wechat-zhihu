const app = getApp();

function followUser(targetId) {
  return toggleFollow(targetId, 'follow');
}

function unfollowUser(targetId) {
  return toggleFollow(targetId, 'unfollow');
}

function toggleFollow(targetId, action) {
  return new Promise((resolve, reject) => {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return reject(new Error('not logged in'));
    if (!targetId || typeof targetId !== 'string') return reject(new Error('invalid targetId'));
    if (openid === targetId) return reject(new Error('cannot follow yourself'));

    wx.cloud.callFunction({
      name: 'toggleFollow',
      data: {
        targetId,
        action
      }
    }).then((res) => {
      if (res.result && res.result.success) {
        resolve(res.result);
        return;
      }
      const errorMsg = (res.result && res.result.error) || `${action} failed`;
      // Idempotent fallback: keep UI state consistent even when backend returns duplicate-state errors.
      if (errorMsg === 'already followed') {
        resolve({
          success: true,
          action: 'follow',
          already: true
        });
        return;
      }
      if (errorMsg === 'follow record not found' || errorMsg === 'already unfollowed') {
        resolve({
          success: true,
          action: 'unfollow',
          already: true
        });
        return;
      }
      reject(new Error(errorMsg));
    }).catch(reject);
  });
}

function checkFollowStatus(targetId) {
  const openid = app.globalData.openid || wx.getStorageSync('openid');
  if (!openid) return Promise.resolve(false);
  return callPublicStats(targetId).then((stats) => !!stats.isFollowing);
}

function normalizeFollowListArgs(userIdOrOptions, maybeOptions) {
  let userId = userIdOrOptions;
  let options = maybeOptions || {};
  if (userIdOrOptions && typeof userIdOrOptions === 'object') {
    options = userIdOrOptions;
    userId = options.userId;
  }
  return {
    userId: userId || options.userId,
    page: Number(options.page || 1),
    pageSize: Number(options.pageSize || 20),
    includeProfile: !!options.includeProfile,
    returnMeta: !!options.returnMeta
  };
}

function callFollowList(type, userIdOrOptions, maybeOptions) {
  const openid = app.globalData.openid || wx.getStorageSync('openid');
  const args = normalizeFollowListArgs(userIdOrOptions, maybeOptions);
  const targetUserId = args.userId || openid;
  if (!targetUserId) {
    return Promise.reject(new Error('not logged in'));
  }

  return wx.cloud.callFunction({
    name: 'getFollowList',
    data: {
      type,
      userId: targetUserId,
      page: args.page > 0 ? args.page : 1,
      pageSize: args.pageSize > 0 ? args.pageSize : 20,
      includeProfile: args.includeProfile
    }
  }).then((res) => {
    if (!res.result || !res.result.success) {
      throw new Error(res.result?.error || 'query failed');
    }
    if (args.returnMeta) {
      return {
        data: res.result.data || [],
        pagination: res.result.pagination || { page: 1, pageSize: args.pageSize, hasMore: false },
        count: res.result.count || 0
      };
    }
    return res.result.data || [];
  });
}

function getFollowingList(userIdOrOptions, maybeOptions) {
  return callFollowList('following', userIdOrOptions, maybeOptions);
}

function getFollowersList(userIdOrOptions, maybeOptions) {
  return callFollowList('followers', userIdOrOptions, maybeOptions);
}

function getFollowStats(userId) {
  const openid = userId || app.globalData.openid || wx.getStorageSync('openid');
  if (!openid) return Promise.reject(new Error('not logged in'));
  return callPublicStats(openid);
}

function callPublicStats(targetId) {
  if (!targetId || typeof targetId !== 'string') {
    return Promise.reject(new Error('invalid targetId'));
  }
  return wx.cloud.callFunction({
    name: 'getUserPublicStats',
    data: { targetId }
  }).then((res) => {
    if (!res.result || !res.result.success) {
      throw new Error(res.result?.error || 'query failed');
    }
    return res.result.data || {
      following: 0,
      followers: 0,
      likes: 0,
      isFollowing: false
    };
  });
}

module.exports = {
  followUser,
  unfollowUser,
  checkFollowStatus,
  getFollowingList,
  getFollowersList,
  getFollowStats
};
