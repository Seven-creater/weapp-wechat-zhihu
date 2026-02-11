// pages/follow-list/index.js
const app = getApp();
const followUtil = require('../../utils/follow.js');

Page({
  data: {
    type: 'following', // following or followers
    users: [],
    loading: false
  },

  onLoad: function (options) {
    this.setData({ type: options.type || 'following' });
    wx.setNavigationBarTitle({
      title: options.type === 'followers' ? '粉丝' : '关注'
    });
  },

  onShow: function () {
    this.loadData();
  },

  /**
   * 加载数据
   */
  loadData: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
      });
      return;
    }

    this.setData({ loading: true });

    console.log('🔍 开始加载列表，类型:', this.data.type, '用户:', openid);

    // 根据类型加载不同的列表
    const loadPromise = this.data.type === 'following' 
      ? followUtil.getFollowingList() 
      : followUtil.getFollowersList();

    loadPromise
      .then(follows => {
        console.log('✅ 查询关注记录成功，数量:', follows ? follows.length : 0);
        
        // 🔧 检查 follows 是否有效
        if (!follows || !Array.isArray(follows)) {
          console.error('❌ follows 数据无效:', follows);
          this.setData({ users: [], loading: false });
          wx.showToast({ 
            title: '数据格式错误', 
            icon: 'none' 
          });
          return Promise.reject(new Error('数据格式错误'));
        }
        
        // 提取用户ID列表
        const userIds = follows.map(f => 
          this.data.type === 'following' ? f.targetId : f._openid
        ).filter(id => id);

        console.log('📋 提取到的用户ID列表:', userIds);

        if (userIds.length === 0) {
          this.setData({ users: [], loading: false });
          return Promise.resolve(null); // 返回 null 而不是 undefined
        }

        // 批量查询用户信息
        return this.batchGetUserInfo(userIds, follows);
      })
      .then(users => {
        if (users !== null && users !== undefined) {
          console.log('✅ 用户信息查询完成，数量:', users.length);
          this.setData({ users, loading: false });
        }
      })
      .catch(err => {
        console.error('❌ 加载列表失败:', err);
        console.error('错误详情:', JSON.stringify(err));
        console.error('错误堆栈:', err.stack);
        this.setData({ loading: false });
        
        // 显示更详细的错误信息
        let errorMsg = '加载失败';
        if (err.errMsg) {
          errorMsg = err.errMsg;
        } else if (err.message) {
          errorMsg = err.message;
        }
        
        wx.showToast({ 
          title: errorMsg, 
          icon: 'none',
          duration: 3000
        });
      });
  },

  /**
   * 批量获取用户信息
   */
  batchGetUserInfo: function (userIds, follows) {
    return new Promise((resolve, reject) => {
      const openid = app.globalData.openid || wx.getStorageSync('openid');

      // 使用云函数批量查询用户信息
      const promises = userIds.map(userId => {
        return wx.cloud.callFunction({
          name: 'getUserInfo',
          data: { targetId: userId }
        }).then(res => {
          if (res.result && res.result.success) {
            return {
              userId: userId,
              userInfo: res.result.data.userInfo || { 
                nickName: '未知用户', 
                avatarUrl: '/images/zhi.png' 
              },
              userType: res.result.data.userType || 'normal'
            };
          }
          return {
            userId: userId,
            userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
            userType: 'normal'
          };
        }).catch(err => {
          console.error('查询用户信息失败:', userId, err);
          return {
            userId: userId,
            userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
            userType: 'normal'
          };
        });
      });

      Promise.all(promises).then(usersData => {
        // 构建用户映射
        const userMap = {};
        usersData.forEach(u => {
          if (u && u.userId) {
            userMap[u.userId] = u;
          }
        });

        // 查询我关注的人（用于显示关注按钮状态）
        followUtil.getFollowingList().then(myFollows => {
          const followingSet = new Set(myFollows.map(f => f.targetId));

          // 构建最终的用户列表
          const users = follows.map(f => {
            const userId = this.data.type === 'following' ? f.targetId : f._openid;
            const userData = userMap[userId];

            // 🔧 防止 userData 为 undefined
            if (!userData) {
              console.warn('⚠️ 用户数据不存在:', userId);
              return {
                userId: userId,
                userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
                userType: 'normal',
                isFollowing: followingSet.has(userId),
                isSelf: userId === openid,
                createTime: f.createTime
              };
            }

            return {
              userId: userId,
              userInfo: userData.userInfo,
              userType: userData.userType,
              isFollowing: followingSet.has(userId),
              isSelf: userId === openid,
              createTime: f.createTime
            };
          });

          resolve(users);
        }).catch(reject);
      }).catch(reject);
    });
  },

  /**
   * 跳转到用户主页
   */
  navigateToProfile: function (e) {
    const userId = e.currentTarget.dataset.id;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    if (!userId) {
      wx.showToast({ title: '用户ID错误', icon: 'none' });
      return;
    }
    
    if (userId === openid) {
      wx.switchTab({ url: '/pages/mine/index' });
      return;
    }
    
    wx.navigateTo({
      url: `/pages/user-profile/index?id=${userId}`
    });
  },

  /**
   * 关注/取消关注
   */
  toggleFollow: function (e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    
    if (!user || user.isSelf) {
      return;
    }

    const action = user.isFollowing ? '取消关注' : '关注';
    
    wx.showLoading({ title: '处理中...' });
    
    const promise = user.isFollowing 
      ? followUtil.unfollowUser(user.userId)
      : followUtil.followUser(user.userId);

    promise
      .then(() => {
        wx.hideLoading();
        wx.showToast({ 
          title: user.isFollowing ? '已取消关注' : '关注成功', 
          icon: 'success' 
        });
        
        // 更新状态
        const users = this.data.users;
        users[index].isFollowing = !user.isFollowing;
        this.setData({ users });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('操作失败:', err);
        wx.showToast({ 
          title: err.message || '操作失败', 
          icon: 'none' 
        });
      });
  }
});
