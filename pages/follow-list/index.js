const app = getApp();

// 延迟初始化数据库
let db = null;

const getDB = () => {
  if (!db) {
    try {
      db = wx.cloud.database();
    } catch (err) {
      console.error('数据库初始化失败:', err);
      return null;
    }
  }
  return db;
};

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
    this.loadData();
  },

  // 🔥 新增：每次显示页面时刷新数据
  onShow: function () {
    console.log('关注列表 onShow - 刷新数据');
    this.loadData();
  },

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

    const db = getDB();
    if (!db) {
      wx.showToast({ title: '数据库初始化失败', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    const collection = 'follows';
    let query = {};

    if (this.data.type === 'following') {
      query = { followerId: openid };
    } else {
      query = { targetId: openid };
    }

    console.log('查询关注/粉丝列表，查询条件:', query);

    db.collection(collection).where(query).get().then(async res => {
      const follows = res.data;
      console.log('查询到的关注/粉丝记录:', follows);
      
      const userIds = follows.map(f => this.data.type === 'following' ? f.targetId : f.followerId);
      console.log('提取的用户ID列表:', userIds);
      
      if (userIds.length === 0) {
        this.setData({ users: [], loading: false });
        return;
      }

      // 🔥 使用云函数批量查询用户信息（自动转换头像URL）
      const userInfoPromises = userIds.map(userId => {
        return wx.cloud.callFunction({
          name: 'getUserInfo',
          data: { targetId: userId }
        }).then(res => {
          if (res.result && res.result.success) {
            return {
              _openid: userId,
              userInfo: res.result.data.userInfo || { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
              stats: res.result.data.stats || {}
            };
          }
          return {
            _openid: userId,
            userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
            stats: {}
          };
        }).catch(err => {
          console.error('查询用户信息失败:', userId, err);
          return {
            _openid: userId,
            userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
            stats: {}
          };
        });
      });

      const usersData = await Promise.all(userInfoPromises);
      console.log('查询到的用户信息:', usersData);

      const userMap = {};
      usersData.forEach(u => {
        userMap[u._openid] = {
          userInfo: u.userInfo,
          stats: u.stats
        };
        console.log('用户映射:', u._openid, '->', userMap[u._openid].userInfo);
      });

      // Check which users I'm following (for the follow button state)
      const myFollowsRes = await db.collection('follows').where({
        followerId: openid
      }).get();
      
      const followingMap = {};
      myFollowsRes.data.forEach(f => {
        followingMap[f.targetId] = f;
      });

      const users = follows.map(f => {
        const uid = this.data.type === 'following' ? f.targetId : f.followerId;
        const myFollow = followingMap[uid];
        const userData = userMap[uid];
        
        console.log('处理用户:', uid, '用户信息:', userData?.userInfo);
        
        return {
          ...f,
          userId: uid,
          userInfo: userData?.userInfo || { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
          stats: userData?.stats || {},
          isFollowing: !!myFollow,
          isMutual: f.isMutual || myFollow?.isMutual || false, // 互相关注标识
          isSelf: uid === openid
        };
      });

      console.log('最终的用户列表:', users);
      this.setData({ users, loading: false });
    }).catch(err => {
      console.error('加载列表失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  navigateToProfile: function (e) {
    const id = e.currentTarget.dataset.id;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    console.log('点击用户，目标ID:', id, '当前用户ID:', openid);
    
    if (id === openid) {
      // 如果是自己，跳转到"我的"页面
      wx.switchTab({ url: '/pages/mine/index' });
      return;
    }
    
    if (id) {
      console.log('跳转到用户主页:', id);
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${id}`
      });
    } else {
      console.error('用户ID为空');
      wx.showToast({ title: '用户ID错误', icon: 'none' });
    }
  },

  toggleFollow: function (e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    const targetId = user.userId;
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

    const db = getDB();
    if (!db) {
      wx.showToast({ title: '操作失败', icon: 'none' });
      return;
    }

    if (user.isFollowing) {
      // Unfollow
      db.collection('follows').where({
        followerId: openid,
        targetId: targetId
      }).remove().then(() => {
        const users = this.data.users;
        users[index].isFollowing = false;
        users[index].isMutual = false;
        this.setData({ users });
        wx.showToast({ title: '已取消关注', icon: 'success' });
        
        // 🔥 调用云函数更新统计
        wx.cloud.callFunction({
          name: 'updateUserStats',
          data: {
            action: 'unfollow',
            followerId: openid,
            targetId: targetId
          }
        }).then(() => {
          console.log('✅ 统计数据已更新');
        }).catch(err => {
          console.error('更新统计失败:', err);
        });
      }).catch(err => {
        console.error('取消关注失败:', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    } else {
      // Follow
      db.collection('follows').add({
        data: {
          followerId: openid,
          targetId: targetId,
          isMutual: false,
          createTime: db.serverDate()
        }
      }).then(() => {
        wx.showToast({ title: '关注成功', icon: 'success' });
        
        // 🔥 调用云函数更新统计和检查互关
        wx.cloud.callFunction({
          name: 'updateUserStats',
          data: {
            action: 'follow',
            followerId: openid,
            targetId: targetId
          }
        }).then(() => {
          // 🔥 重新加载数据以获取最新的互关状态和统计
          console.log('✅ 统计数据已更新，重新加载列表');
          this.loadData();
        }).catch(err => {
          console.error('更新统计失败:', err);
          // 即使失败也重新加载
          this.loadData();
        });
      }).catch(err => {
        console.error('关注失败:', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    }
  }
});
