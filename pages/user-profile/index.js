const app = getApp();
const followUtil = require('../../utils/follow.js');
const mediaUtil = require('../../utils/cloud-media.js');

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
    },
    // 🆕 用户身份相关
    userType: 'normal',  // 🔧 添加 userType
    badge: null,         // 徽章信息
    profile: {},         // 补充信息
    reputation: null     // 信誉评分
  },

  onLoad: function (options) {
    const targetId = options.id;
    
    if (!targetId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

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
    this._lastLoadedAt = Date.now();
    this._postsLastLoadedAt = this._lastLoadedAt;
    this._dirtyProfileData = false;
  },

  onShow: function () {
    const targetId = this.data.targetId;
    if (targetId) {
      const now = Date.now();
      const ttlMs = 30 * 1000;
      const expired = now - (this._lastLoadedAt || 0) > ttlMs;
      const profilePostsDirtyAt = Number(wx.getStorageSync(`profilePostsDirtyAt:${targetId}`) || 0);
      const postsDirty = profilePostsDirtyAt > (this._postsLastLoadedAt || 0);
      if (this._profileInflight || (!expired && !this._dirtyProfileData)) {
        if (this.data.currentTab === 0 && postsDirty) {
          this.loadPosts(targetId);
        }
        return;
      }
      this._profileInflight = true;
      this._lastLoadedAt = now;
      this._dirtyProfileData = false;
      this.loadStats(targetId);
      this.checkFollowStatus(targetId);
      if (this.data.currentTab === 0 && (expired || postsDirty)) {
        this.loadPosts(targetId);
      }
      this._profileInflight = false;
    }
  },

  loadUserInfo: function (openid) {
    const selfOpenid = app.globalData.openid || wx.getStorageSync('openid');
    const includeSensitive = !!selfOpenid && selfOpenid === openid;
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid,
        fieldMode: 'full',
        includeSensitive
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const userData = res.result.data;
        const userInfo = userData.userInfo || {
          nickName: '未知用户',
          avatarUrl: '/images/zhi.png'
        };
        
        // ✅ 添加 phoneNumber 到 userInfo
        userInfo.phoneNumber = userData.phoneNumber || '';
        
        // 🔥 只设置用户信息，不设置 stats（stats 由 loadStats 实时计算）
        this.setData({ 
          userInfo: userInfo,
          userType: userData.userType || 'normal',  // 🔧 设置用户类型
          badge: userData.badge || null,            // 🆕 徽章信息
          profile: userData.profile || {},          // 🆕 补充信息
          reputation: userData.reputation || null   // 🆕 信誉评分
        });
        
        wx.setNavigationBarTitle({
          title: userInfo.nickName || '用户主页'
        });
      } else {
        this.setData({ 
          userInfo: {
            nickName: '未知用户',
            avatarUrl: '/images/zhi.png'
          }
        });
        wx.showToast({ title: '该用户暂未完善信息', icon: 'none' });
      }
    }).catch(err => {
      console.error('加载用户信息失败:', err);
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

    followUtil.checkFollowStatus(targetId)
      .then(isFollowing => {
        this.setData({ isFollowing });
      })
      .catch(err => {
        console.error('检查关注状态失败:', err);
      });
  },

  loadStats: function (targetId) {
    // 使用关注工具类加载统计数据
    followUtil.getFollowStats(targetId)
      .then(stats => {
        this.setData({ 
          'stats.following': stats.following,
          'stats.followers': stats.followers,
          'stats.likes': stats.likes || 0
        });
      })
      .catch(err => {
        console.error('加载统计失败:', err);
      });

    // 加载获赞数
    // likes are returned by getUserPublicStats through followUtil.getFollowStats.
  },

  loadStatsFromCollections: function(targetId) {
    wx.cloud.callFunction({
      name: 'getUserPublicStats',
      data: { targetId }
    })
      .then((res) => {
        if (!res.result || !res.result.success) return;
        const stats = res.result.data || {};
        this.setData({ "stats.likes": stats.likes || 0 });
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
          fieldMode: 'list',
          authorOpenids: [targetId]
        }
      }).then(res => {
        if (res.result && res.result.success) {
          const posts = (res.result.data || []).map(item => ({
            id: item._id,
            title: item.content || item.title || '无标题',
            image: (item.images && item.images.length > 0) ? item.images[0] : '/images/24213.jpg',
            hasImage: item.images && item.images.length > 0,  // ✅ 判断是否有图片
            likes: item.stats ? item.stats.like : 0,
            route: '/pages/post-detail/index'
          }));
          this.setData({
            posts: this.mapDocsToCards(res.result.data || [], '/pages/post-detail/index')
          });
          this._postsLastLoadedAt = Date.now();
        } else {
          this.setData({ posts: [] });
        }
      }).catch(err => {
        console.error('加载帖子失败:', err);
        this.setData({ posts: [] });
      });
    } else if (this.data.currentTab === 1) {
      // 🔥 收藏标签页：查询收藏的帖子详情
      this.loadCollectedPosts(targetId);
    } else if (this.data.currentTab === 2) {
      // 🔥 赞过标签页：查询点赞的帖子详情
      this.loadLikedPosts(targetId);
    } else {
      // 其他标签页暂时为空
      this.setData({ posts: [] });
    }
  },

  // 加载收藏的帖子（包含真实点赞数）
  loadCollectedPosts: function(targetId) {
    this.loadActionCards(targetId, ['collect_post', 'collect_solution', 'collect']);
  },

  // 加载点赞的帖子（包含真实点赞数）
  loadLikedPosts: function(targetId) {
    this.loadActionCards(targetId, ['like_post', 'like_solution', 'like']);
  },

  // 转换云存储图片URL
  loadActionCards: async function(targetId, actionTypes) {
    const type = (actionTypes || []).some((item) => String(item).indexOf('collect') > -1)
      ? 'collect'
      : 'like';
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserActions',
        data: {
          targetId,
          type,
          page: 1,
          pageSize: 20
        }
      });
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || 'query failed');
      }
      this.setData({ posts: res.result.data || [] });
    } catch (err) {
      console.error('loadActionCards failed:', err);
      this.setData({ posts: [] });
    }
  },

  formatPostTag: function(doc) {
    const subtypeText = Array.isArray(doc.recognizedSubtypes) && doc.recognizedSubtypes.length
      ? doc.recognizedSubtypes.join('、')
      : doc.recognizedSubtype;
    if (doc.recognizedCategory && subtypeText) {
      return `${doc.recognizedCategory} / ${subtypeText}`;
    }
    return doc.recognizedCategory || doc.categoryName || doc.category || '';
  },

  mapDocsToCards: function(docs, route) {
    return (docs || []).map((item) => {
      const image = mediaUtil.pickImageFromDoc(item);
      return {
        id: item._id,
        title: item.content || item.title || '无标题',
        tag: this.formatPostTag(item),
        image: image || '',
        hasImage: !!image,
        likes: item.stats ? (item.stats.like || 0) : 0,
        route: route || '/pages/post-detail/index'
      };
    });
  },

  convertCloudImages: async function(posts) {
    const cloudIds = mediaUtil.collectCloudFileIdsDeep(posts || []);
    if (!cloudIds || cloudIds.size === 0) {
      return posts || [];
    }

    const mapping = await mediaUtil.resolveTempUrlMap(Array.from(cloudIds));
    return (posts || []).map((item) => mediaUtil.replaceCloudUrlsDeep(item, mapping));
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

    const isFollowing = this.data.isFollowing;
    
    wx.showLoading({ title: '处理中...' });
    
    const promise = isFollowing 
      ? followUtil.unfollowUser(targetId)
      : followUtil.followUser(targetId);

    promise
      .then((result) => {
        wx.hideLoading();
        const nextFollowing = result && result.action
          ? result.action === 'follow'
          : !isFollowing;
        this.setData({ isFollowing: nextFollowing });
        wx.showToast({ 
          title: isFollowing ? '已取消关注' : '关注成功', 
          icon: 'success' 
        });
        
        // 刷新统计数据
        this.loadStats(targetId);
      })
      .catch(err => {
        wx.hideLoading();
        console.error('操作失败:', err);
        wx.showToast({ 
          title: err.message || '操作失败', 
          icon: 'none' 
        });
      });
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
  },

  /**
   * 🆕 拨打电话
   */
  makePhoneCall: function (e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) {
      wx.showToast({
        title: '电话号码为空',
        icon: 'none'
      });
      return;
    }

    wx.makePhoneCall({
      phoneNumber: phone,
      success: () => {
        console.log('拨号成功:', phone);
      },
      fail: (err) => {
        console.error('拨号失败:', err);
        wx.showToast({
          title: '拨号失败',
          icon: 'none'
        });
      }
    });
  }
});
