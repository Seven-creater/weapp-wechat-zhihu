// utils/follow.js
// 关注功能工具类

const app = getApp();

/**
 * 关注用户
 * @param {string} targetId - 被关注者的 openid
 * @returns {Promise}
 */
function followUser(targetId) {
  return new Promise((resolve, reject) => {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      reject(new Error('未登录'));
      return;
    }
    
    if (openid === targetId) {
      reject(new Error('不能关注自己'));
      return;
    }
    
    const db = wx.cloud.database();
    
    // 添加关注记录
    db.collection('follows').add({
      data: {
        targetId: targetId,
        createTime: db.serverDate()
      }
    }).then(() => {
      console.log('✅ 关注成功');
      resolve();
    }).catch(err => {
      console.error('❌ 关注失败:', err);
      reject(err);
    });
  });
}

/**
 * 取消关注
 * @param {string} targetId - 被关注者的 openid
 * @returns {Promise}
 */
function unfollowUser(targetId) {
  return new Promise((resolve, reject) => {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      reject(new Error('未登录'));
      return;
    }
    
    const db = wx.cloud.database();
    
    // 删除关注记录
    db.collection('follows')
      .where({
        _openid: openid,
        targetId: targetId
      })
      .remove()
      .then(() => {
        console.log('✅ 取消关注成功');
        resolve();
      })
      .catch(err => {
        console.error('❌ 取消关注失败:', err);
        reject(err);
      });
  });
}

/**
 * 检查是否已关注
 * @param {string} targetId - 被关注者的 openid
 * @returns {Promise<boolean>}
 */
function checkFollowStatus(targetId) {
  return new Promise((resolve, reject) => {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      resolve(false);
      return;
    }
    
    const db = wx.cloud.database();
    
    db.collection('follows')
      .where({
        _openid: openid,
        targetId: targetId
      })
      .count()
      .then(res => {
        resolve(res.total > 0);
      })
      .catch(err => {
        console.error('❌ 检查关注状态失败:', err);
        reject(err);
      });
  });
}

/**
 * 获取关注列表（我关注的人）
 * @param {string} userId - 用户 openid（可选，默认当前用户）
 * @returns {Promise<Array>}
 */
function getFollowingList(userId) {
  return new Promise((resolve, reject) => {
    const openid = userId || app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      reject(new Error('未登录'));
      return;
    }
    
    // 使用云函数查询，避免权限问题
    wx.cloud.callFunction({
      name: 'getFollowList',
      data: {
        type: 'following',
        userId: openid
      }
    }).then(res => {
      if (res.result && res.result.success) {
        console.log('✅ 查询关注列表成功，数量:', res.result.count);
        resolve(res.result.data);
      } else {
        console.error('❌ 查询关注列表失败:', res.result.error);
        reject(new Error(res.result.error || '查询失败'));
      }
    }).catch(err => {
      console.error('❌ 调用云函数失败:', err);
      reject(err);
    });
  });
}

/**
 * 获取粉丝列表（关注我的人）
 * @param {string} userId - 用户 openid（可选，默认当前用户）
 * @returns {Promise<Array>}
 */
function getFollowersList(userId) {
  return new Promise((resolve, reject) => {
    const openid = userId || app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      reject(new Error('未登录'));
      return;
    }
    
    // 使用云函数查询，避免权限问题
    wx.cloud.callFunction({
      name: 'getFollowList',
      data: {
        type: 'followers',
        userId: openid
      }
    }).then(res => {
      if (res.result && res.result.success) {
        console.log('✅ 查询粉丝列表成功，数量:', res.result.count);
        resolve(res.result.data);
      } else {
        console.error('❌ 查询粉丝列表失败:', res.result.error);
        reject(new Error(res.result.error || '查询失败'));
      }
    }).catch(err => {
      console.error('❌ 调用云函数失败:', err);
      reject(err);
    });
  });
}

/**
 * 获取关注统计
 * @param {string} userId - 用户 openid（可选，默认当前用户）
 * @returns {Promise<Object>} { following: number, followers: number }
 */
function getFollowStats(userId) {
  return new Promise((resolve, reject) => {
    const openid = userId || app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      reject(new Error('未登录'));
      return;
    }
    
    const db = wx.cloud.database();
    
    Promise.all([
      // 关注数
      db.collection('follows').where({ _openid: openid }).count(),
      // 粉丝数
      db.collection('follows').where({ targetId: openid }).count()
    ]).then(([followingRes, followersRes]) => {
      const stats = {
        following: followingRes.total || 0,
        followers: followersRes.total || 0
      };
      console.log('✅ 查询关注统计成功:', stats);
      resolve(stats);
    }).catch(err => {
      console.error('❌ 查询关注统计失败:', err);
      reject(err);
    });
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

