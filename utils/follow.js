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
  return new Promise((resolve, reject) => {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return resolve(false);

    const db = wx.cloud.database();
    const cmd = db.command;
    db.collection('follows')
      .where(cmd.or([
        { followerId: openid, targetId },
        { _openid: openid, targetId }
      ]))
      .count()
      .then((res) => resolve((res.total || 0) > 0))
      .catch(reject);
  });
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
  return new Promise((resolve, reject) => {
    const openid = userId || app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return reject(new Error('not logged in'));

    const db = wx.cloud.database();
    const cmd = db.command;
    Promise.all([
      db.collection('follows').where(cmd.or([
        { followerId: openid },
        { _openid: openid }
      ])).count(),
      db.collection('follows').where({ targetId: openid }).count()
    ]).then(([followingRes, followersRes]) => {
      resolve({
        following: followingRes.total || 0,
        followers: followersRes.total || 0
      });
    }).catch(reject);
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
