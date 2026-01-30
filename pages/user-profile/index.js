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
    targetId: '',
    userInfo: {
      nickName: '加载中...',
      avatarUrl: '/images/zhi.png'
    },
    isFollowing: false,
    isMutual: false, // 是否互相关注
    currentTab: 0,
    posts: [],
    stats: {
      following: 0,
      followers: 0,
      likes: 0
    }
  },

  onLoad: function (options) {
    const targetId = options.id;
    console.log('========================================');
    console.log('用户主页 onLoad');
    console.log('接收到的参数 options:', options);
    console.log('目标用户ID (targetId):', targetId);
    console.log('当前登录用户ID:', app.globalData.openid || wx.getStorageSync('openid'));
    console.log('========================================');
    
    if (!targetId) {
      console.error('❌ 错误：targetId 为空');
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 🔥 关键修复：立即设置 targetId，防止使用错误的数据
    this.setData({ 
      targetId: targetId,
      userInfo: {
        nickName: '加载中...',
        avatarUrl: '/images/zhi.png'
      }
    });
    
    this.loadUserInfo(targetId);
    this.checkFollowStatus(targetId);
    this.loadStats(targetId);
    this.loadPosts(targetId);
  },

  // 🔥 新增：每次显示页面时刷新统计数据
  onShow: function () {
    const targetId = this.data.targetId;
    if (targetId) {
      console.log('用户主页 onShow - 刷新统计数据');
      this.loadStats(targetId);
      this.checkFollowStatus(targetId);
    }
  },

  loadUserInfo: function (openid) {
    console.log('========================================');
    console.log('📥 开始加载用户信息');
    console.log('目标 openid:', openid);
    console.log('当前登录用户 openid:', app.globalData.openid || wx.getStorageSync('openid'));
    console.log('========================================');

    // 🔥 使用云函数查询，避免权限问题
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid
      }
    }).then(res => {
      console.log('========================================');
      console.log('📊 云函数查询结果');
      console.log('完整结果:', res.result);
      console.log('========================================');
      
      if (res.result && res.result.success) {
        const userData = res.result.data;
        console.log('✅ 找到用户数据');
        console.log('用户 _openid:', userData._openid);
        console.log('用户 userInfo:', userData.userInfo);
        console.log('用户 stats:', userData.stats);
        
        // 确保 userInfo 存在
        const userInfo = userData.userInfo || {
          nickName: '未知用户',
          avatarUrl: '/images/zhi.png'
        };
        
        console.log('========================================');
        console.log('🎯 准备设置到页面的数据');
        console.log('nickName:', userInfo.nickName);
        console.log('avatarUrl:', userInfo.avatarUrl);
        console.log('========================================');
        
        this.setData({ 
          userInfo: userInfo,
          'stats.following': userData.stats?.followingCount || 0,
          'stats.followers': userData.stats?.followersCount || 0,
          'stats.likes': userData.stats?.likesCount || 0
        }, () => {
          console.log('========================================');
          console.log('✅ setData 完成');
          console.log('页面当前 userInfo:', this.data.userInfo);
          console.log('页面当前 targetId:', this.data.targetId);
          console.log('========================================');
        });
        
        wx.setNavigationBarTitle({
          title: userInfo.nickName || '用户主页'
        });
      } else {
        console.log('========================================');
        console.log('❌ 用户不存在');
        console.log('查询的 openid:', openid);
        console.log('错误信息:', res.result?.error);
        console.log('========================================');
        
        // 设置默认用户信息
        this.setData({ 
          userInfo: {
            nickName: '未知用户',
            avatarUrl: '/images/zhi.png'
          }
        });
        wx.showToast({ title: '该用户暂未完善信息', icon: 'none' });
      }
    }).catch(err => {
      console.log('========================================');
      console.error('❌ 加载用户信息失败');
      console.error('错误信息:', err);
      console.log('========================================');
      
      // 设置默认用户信息
      this.setData({ 
        userInfo: {
          nickName: '未知用户',
          avatarUrl: '/images/zhi.png'
        }
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  checkFollowStatus: function (targetId) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return;

    const db = getDB();
    if (!db) return;

    // 检查我是否关注了对方
    db.collection('follows').where({
      followerId: openid,
      targetId: targetId
    }).get().then(res => {
      const isFollowing = res.data.length > 0;
      const isMutual = res.data[0]?.isMutual || false;
      
      this.setData({ 
        isFollowing: isFollowing,
        isMutual: isMutual
      });
      
      console.log('关注状态:', { isFollowing, isMutual });
    }).catch(err => {
      console.error('检查关注状态失败:', err);
    });
  },

  loadStats: function (targetId) {
    // 🔥 优先从 users 集合的 stats 字段读取（最准确）
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: { targetId }
    }).then(res => {
      if (res.result && res.result.success && res.result.data.stats) {
        const stats = res.result.data.stats;
        this.setData({
          'stats.following': stats.followingCount || 0,
          'stats.followers': stats.followersCount || 0,
          'stats.likes': stats.likesCount || 0,
        });
        console.log('✅ 用户主页：从 users 集合加载统计数据:', stats);
      } else {
        // 降级方案：实时查询
        this.loadStatsFromCollections(targetId);
      }
    }).catch(err => {
      console.error('加载统计数据失败，使用降级方案:', err);
      this.loadStatsFromCollections(targetId);
    });
  },

  // 🔥 降级方案：从各个集合实时查询统计数据
  loadStatsFromCollections: function(targetId) {
    const db = getDB();
    if (!db) return;

    // Load following count
    db.collection('follows').where({
      followerId: targetId
    }).count().then(res => {
      this.setData({ 'stats.following': res.total });
    }).catch(err => {
      console.error('加载关注数失败:', err);
    });

    // Load followers count
    db.collection('follows').where({
      targetId: targetId
    }).count().then(res => {
      this.setData({ 'stats.followers': res.total });
    }).catch(err => {
      console.error('加载粉丝数失败:', err);
    });

    // 🔥 加载获赞数（该用户的帖子被点赞的总数）
    db.collection("posts")
      .where({ _openid: targetId })
      .field({ stats: true })
      .get()
      .then((res) => {
        const posts = res.data || [];
        const totalLikes = posts.reduce((sum, post) => {
          return sum + ((post.stats && post.stats.like) || 0);
        }, 0);
        this.setData({ "stats.likes": totalLikes });
      })
      .catch((err) => {
        console.error('加载获赞数失败:', err);
      });
  },

  loadPosts: function (targetId) {
    if (this.data.currentTab === 0) {
      // 🔥 动态标签页：使用 getPublicData 云函数查询用户帖子（自动转换图片URL）
      wx.cloud.callFunction({
        name: 'getPublicData',
        data: {
          collection: 'posts',
          page: 1,
          pageSize: 20,
          orderBy: 'createTime',
          order: 'desc',
          authorOpenids: [targetId]
        }
      }).then(res => {
        if (res.result && res.result.success) {
          const posts = (res.result.data || []).map(item => ({
            id: item._id,
            title: item.content || item.title || '无标题',
            image: (item.images && item.images.length > 0) ? item.images[0] : '/images/24213.jpg',
            likes: item.stats ? item.stats.like : 0,
            route: '/pages/post-detail/index'
          }));
          this.setData({ posts });
        } else {
          this.setData({ posts: [] });
        }
      }).catch(err => {
        console.error('加载帖子失败:', err);
        this.setData({ posts: [] });
      });
    } else if (this.data.currentTab === 1) {
      // 🔥 收藏标签页：使用 getUserActions 云函数查询用户收藏
      wx.cloud.callFunction({
        name: 'getUserActions',
        data: {
          targetId: targetId,
          type: 'collect',
          page: 1,
          pageSize: 20
        }
      }).then(res => {
        if (res.result && res.result.success) {
          const actions = res.result.data || [];
          const posts = actions.map(item => ({
            id: item.targetId || item.postId,
            title: item.title || '无标题',
            image: item.image || '/images/24213.jpg',
            likes: 0,
            route: item.targetRoute || '/pages/post-detail/index'
          }));
          this.setData({ posts });
        } else {
          this.setData({ posts: [] });
        }
      }).catch(err => {
        console.error('加载收藏失败:', err);
        this.setData({ posts: [] });
      });
    } else if (this.data.currentTab === 2) {
      // 🔥 赞过标签页：使用 getUserActions 云函数查询用户点赞
      wx.cloud.callFunction({
        name: 'getUserActions',
        data: {
          targetId: targetId,
          type: 'like',
          page: 1,
          pageSize: 20
        }
      }).then(res => {
        if (res.result && res.result.success) {
          const actions = res.result.data || [];
          const posts = actions.map(item => ({
            id: item.targetId || item.postId,
            title: item.title || '无标题',
            image: item.image || '/images/24213.jpg',
            likes: 0,
            route: item.targetRoute || '/pages/post-detail/index'
          }));
          this.setData({ posts });
        } else {
          this.setData({ posts: [] });
        }
      }).catch(err => {
        console.error('加载点赞失败:', err);
        this.setData({ posts: [] });
      });
    } else {
      // 其他标签页暂时为空
      this.setData({ posts: [] });
    }
  },

  onTabTap: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index }, () => {
      this.loadPosts(this.data.targetId);
    });
  },

  toggleFollow: function () {
    const targetId = this.data.targetId;
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

    if (openid === targetId) {
      wx.showToast({ title: '不能关注自己', icon: 'none' });
      return;
    }

    const db = getDB();
    if (!db) {
      wx.showToast({ title: '操作失败', icon: 'none' });
      return;
    }

    if (this.data.isFollowing) {
      // Unfollow
      db.collection('follows').where({
        followerId: openid,
        targetId: targetId
      }).remove().then(() => {
        this.setData({ 
          isFollowing: false,
          isMutual: false
        });
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
          // 🔥 立即刷新统计数据
          this.loadStats(targetId);
        }).catch(err => {
          console.error('更新统计失败:', err);
          // 即使云函数失败，也刷新统计
          this.loadStats(targetId);
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
          // 🔥 立即刷新关注状态和统计数据
          this.checkFollowStatus(targetId);
          this.loadStats(targetId);
        }).catch(err => {
          console.error('更新统计失败:', err);
          // 即使云函数失败，也刷新数据
          this.checkFollowStatus(targetId);
          this.loadStats(targetId);
        });
      }).catch(err => {
        console.error('关注失败:', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    }
  },

  navigateToChat: function () {
    const targetId = this.data.targetId;
    const openid = app.globalData.openid || wx.getStorageSync('openid');

    if (!openid) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再发起私信',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
      });
      return;
    }

    if (openid === targetId) {
      wx.showToast({ title: '不能私信自己', icon: 'none' });
      return;
    }

    // 传递目标用户信息到聊天页面
    wx.navigateTo({
      url: `/pages/chat/chat?id=${targetId}&nickname=${this.data.userInfo.nickName || '用户'}`
    });
  },

  navigateToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const route = e.currentTarget.dataset.route || '/pages/post-detail/index';
    if (!id) return;
    
    const url = route.indexOf('?') > -1 ? `${route}&id=${id}` : `${route}?id=${id}`;
    wx.navigateTo({ url });
  }
});
