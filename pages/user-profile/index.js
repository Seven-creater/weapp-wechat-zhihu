const app = getApp();
const followUtil = require('../../utils/follow.js');
const mediaUtil = require('../../utils/cloud-media.js');

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
          'stats.followers': stats.followers
        });
      })
      .catch(err => {
        console.error('加载统计失败:', err);
      });

    // 加载获赞数
    this.loadStatsFromCollections(targetId);
  },

  // 🔥 降级方案：从各个集合实时查询统计数据
  loadStatsFromCollections: function(targetId) {
    const db = getDB();
    if (!db) return;

    // 🔥 加载获赞数（该用户的帖子被点赞的总数）
    db.collection("posts")
      .where({ _openid: targetId })
      .field({ stats: true, _id: true })
      .get()
      .then((res) => {
        const posts = res.data || [];
        const totalLikes = posts.reduce((sum, post) => {
          const likes = (post.stats && post.stats.like) || 0;
          return sum + likes;
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
    return;

    const db = getDB();
    if (!db) {
      this.setData({ posts: [] });
      return;
    }

    // 1. 先查询收藏记录
    db.collection('actions')
      .where({
        _openid: targetId,
        type: db.command.in(['collect_post', 'collect_solution', 'collect'])
      })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()
      .then(async (res) => {
        const actions = res.data || [];
        if (actions.length === 0) {
          this.setData({ posts: [] });
          return;
        }

        // 2. 提取帖子ID
        const postIds = actions.map(a => a.targetId || a.postId).filter(Boolean);
        
        if (postIds.length === 0) {
          this.setData({ posts: [] });
          return;
        }
        
        // 3. 批量查询帖子详情
        const postsRes = await db.collection('posts')
          .where({ _id: db.command.in(postIds) })
          .get();

        // 4. 转换图片URL
        const posts = await this.convertCloudImages(postsRes.data || []);

        // 5. 映射为显示格式（只显示能查到详情的帖子）
        const mappedPosts = posts
          .filter(item => item && item._id) // 过滤无效数据
          .map(item => ({
            id: item._id,
            title: item.content || item.title || '无标题',
            image: (item.images && item.images.length > 0) ? item.images[0] : '/images/24213.jpg',
            hasImage: item.images && item.images.length > 0,  // ✅ 判断是否有图片
            likes: item.stats ? item.stats.like : 0,
            route: '/pages/post-detail/index'
          }));

        this.setData({ posts: mappedPosts });
      })
      .catch(err => {
        console.error('加载收藏失败:', err);
        this.setData({ posts: [] });
      });
  },

  // 加载点赞的帖子（包含真实点赞数）
  loadLikedPosts: function(targetId) {
    this.loadActionCards(targetId, ['like_post', 'like_solution', 'like']);
    return;

    const db = getDB();
    if (!db) {
      this.setData({ posts: [] });
      return;
    }

    // 1. 先查询点赞记录
    db.collection('actions')
      .where({
        _openid: targetId,
        type: db.command.in(['like_post', 'like_solution', 'like'])
      })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()
      .then(async (res) => {
        const actions = res.data || [];
        if (actions.length === 0) {
          this.setData({ posts: [] });
          return;
        }

        // 2. 提取帖子ID
        const postIds = actions.map(a => a.targetId || a.postId).filter(Boolean);
        
        if (postIds.length === 0) {
          this.setData({ posts: [] });
          return;
        }
        
        // 3. 批量查询帖子详情
        const postsRes = await db.collection('posts')
          .where({ _id: db.command.in(postIds) })
          .get();

        // 4. 转换图片URL
        const posts = await this.convertCloudImages(postsRes.data || []);

        // 5. 映射为显示格式（只显示能查到详情的帖子）
        const mappedPosts = posts
          .filter(item => item && item._id) // 过滤无效数据
          .map(item => ({
            id: item._id,
            title: item.content || item.title || '无标题',
            image: (item.images && item.images.length > 0) ? item.images[0] : '/images/24213.jpg',
            hasImage: item.images && item.images.length > 0,  // ✅ 判断是否有图片
            likes: item.stats ? item.stats.like : 0,
            route: '/pages/post-detail/index'
          }));

        this.setData({ posts: mappedPosts });
      })
      .catch(err => {
        console.error('加载点赞失败:', err);
        this.setData({ posts: [] });
      });
  },

  // 转换云存储图片URL
  loadActionCards: async function(targetId, actionTypes) {
    const db = getDB();
    if (!db) {
      this.setData({ posts: [] });
      return;
    }

    try {
      const actionRes = await db.collection('actions')
        .where({
          _openid: targetId,
          type: db.command.in(actionTypes)
        })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();

      const actions = actionRes.data || [];
      if (actions.length === 0) {
        this.setData({ posts: [] });
        return;
      }

      const postIds = [];
      const solutionIds = [];
      actions.forEach((action) => {
        const targetId = action.targetId || action.postId;
        if (!targetId) return;
        const actionType = String(action.type || '');
        const targetCollection = String(action.targetCollection || '');
        const isSolution = actionType.indexOf('_solution') > -1 || targetCollection === 'solutions';
        if (isSolution) {
          solutionIds.push(targetId);
        } else {
          postIds.push(targetId);
        }
      });

      const [postDocs, solutionDocs] = await Promise.all([
        this.fetchDocsByIds('posts', postIds),
        this.fetchDocsByIds('solutions', solutionIds)
      ]);
      const postMap = new Map(postDocs.map((item) => [item._id, item]));
      const solutionMap = new Map(solutionDocs.map((item) => [item._id, item]));

      const cards = [];
      actions.forEach((action) => {
        const targetId = action.targetId || action.postId;
        if (!targetId) return;
        const actionType = String(action.type || '');
        const targetCollection = String(action.targetCollection || '');
        const isSolution = actionType.indexOf('_solution') > -1 || targetCollection === 'solutions';
        const doc = isSolution ? solutionMap.get(targetId) : postMap.get(targetId);
        if (!doc) return;

        cards.push({
          id: doc._id,
          title: doc.content || doc.title || '无标题',
          tag: this.formatPostTag(doc),
          image: mediaUtil.pickImageFromDoc(doc) || '',
          hasImage: !!mediaUtil.pickImageFromDoc(doc),
          likes: doc.stats ? (doc.stats.like || 0) : 0,
          route: isSolution ? '/pages/solution-detail/index' : '/pages/post-detail/index'
        });
      });

      this.setData({ posts: cards });
    } catch (err) {
      console.error('loadActionCards failed:', err);
      this.setData({ posts: [] });
    }
  },

  fetchDocsByIds: async function(collection, ids) {
    const db = getDB();
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean))).slice(0, 50);
    if (!db || uniqueIds.length === 0) return [];

    const res = await db.collection(collection)
      .where({ _id: db.command.in(uniqueIds) })
      .get();
    return this.convertCloudImages(res.data || []);
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
