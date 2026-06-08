// pages/mine/index.js
const app = getApp();
const followUtil = require('../../utils/follow.js');

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
    userInfo: {},
    isLoggedIn: false,
    currentTab: 0,
    posts: [],
    stats: {
      following: 0,
      followers: 0,
      likes: 0,
    },
    page: 1,
    pageSize: 12,
    hasMore: true,
    loading: false,
    emptyText: "这里空空如也~",
    isAdmin: false,
  },

  onLoad: function (options) {
    const tabIndex =
      options && typeof options.tab !== "undefined"
        ? parseInt(options.tab, 10)
        : NaN;
    if (!Number.isNaN(tabIndex)) {
      this.setData({ currentTab: tabIndex });
    }
  },

  _legacyOnShowV1: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 4
      });
    }
    
    // ✅ 每次显示页面时都重新加载用户信息（确保认证状态实时更新）
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (openid) {
      this.loadFullUserInfo(openid);
      // 🆕 每次显示页面时都刷新统计数据
      this.loadStats();
    }
    
    this.checkLoginStatus();
  },

  _legacyCheckLoginStatus: async function () {
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");

    if (openid && userInfo) {
      let avatarUrl = userInfo.avatarUrl;
      if (!avatarUrl || avatarUrl.trim() === '' || avatarUrl === 'undefined' || avatarUrl === 'null') {
        console.warn('⚠️ 头像URL无效:', avatarUrl, '使用默认头像');
        avatarUrl = '/images/zhi.png';
        userInfo.avatarUrl = avatarUrl;
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
      }
      
      console.log('📊 当前用户信息:', {
        nickName: userInfo.nickName,
        avatarUrl: avatarUrl,
        userType: userInfo.userType
      });
      
      // 异步检查管理员权限
      const isAdmin = await this.checkIsAdmin(openid);
      
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        isAdmin: isAdmin,
      });
      
      this.loadFullUserInfo(openid);
      this.loadStats();
      this.loadPosts(true);
    } else {
      this.setData({
        isLoggedIn: false,
        userInfo: {},
        posts: [],
        stats: {
          following: 0,
          followers: 0,
          likes: 0,
        },
        isAdmin: false,
      });
    }
  },

  // 覆盖旧实现：onShow 不再先行重复请求，由 checkLoginStatus 统一加载
  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 4
      });
    }
    this.checkLoginStatus();
  },

  // 覆盖旧实现：加入 inflight + TTL 门闩，避免 onShow 重复全量加载
  checkLoginStatus: async function (options = {}) {
    const force = !!options.force;
    const now = Date.now();
    const ttlMs = 30 * 1000;
    const expired = now - (this._lastLoadedAt || 0) > ttlMs;
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const profilePostsDirtyAt = Number(
      wx.getStorageSync(openid ? `profilePostsDirtyAt:${openid}` : "profilePostsDirtyAt") || 0
    );
    const postsDirty = profilePostsDirtyAt > (this._lastLoadedAt || 0);
    if (!force && this._statusInflight) return;
    if (!force && !expired && !this._dirtyProfile && !postsDirty) return;

    this._statusInflight = true;
    try {
      const openid = app.globalData.openid || wx.getStorageSync("openid");
      const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");

      if (openid && userInfo) {
        let avatarUrl = userInfo.avatarUrl;
        if (!avatarUrl || avatarUrl.trim() === '' || avatarUrl === 'undefined' || avatarUrl === 'null') {
          avatarUrl = '/images/zhi.png';
          userInfo.avatarUrl = avatarUrl;
          app.globalData.userInfo = userInfo;
          wx.setStorageSync('userInfo', userInfo);
        }

        const isAdmin = await this.checkIsAdmin(openid);
        this.setData({
          isLoggedIn: true,
          userInfo: userInfo,
          isAdmin: isAdmin,
        });

        this.loadFullUserInfo(openid);
        this.loadStats();
        this.loadPosts(true);
      } else {
        this.setData({
          isLoggedIn: false,
          userInfo: {},
          posts: [],
          stats: {
            following: 0,
            followers: 0,
            likes: 0,
          },
          isAdmin: false,
        });
      }

      this._dirtyProfile = false;
      this._lastLoadedAt = Date.now();
    } finally {
      this._statusInflight = false;
    }
  },

  checkIsAdmin: async function(openid) {
    if (!openid) return false;
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCurrentUserAccess',
        data: {}
      });
      if (res.result && res.result.success) {
        return !!(res.result.data && res.result.data.isAdmin);
      }
    } catch (err) {
      console.error('查询管理员权限失败:', err);
    }
    return false;
  },

  navigateToAdminCertification: function() {
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '权限不足',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/admin-certification/index'
    });
  },

  loadFullUserInfo: function (openid) {
    console.log('???????');
    
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid,
        fieldMode: 'full',
        includeSensitive: true
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const userData = res.result.data;
        
        console.log('📊 从数据库获取的用户数据:', {
          userType: userData.userType,
          badge: userData.badge,
          profile: userData.profile,
          phoneNumber: userData.phoneNumber
        });
        
        let avatarUrl = userData.userInfo.avatarUrl;
        if (!avatarUrl || avatarUrl.trim() === '') {
          avatarUrl = '/images/zhi.png';
          console.warn('⚠️ 头像URL为空，使用默认头像');
        }
        
        // ✅ 使用数据库中的最新数据，包含 phoneNumber
        const fullUserInfo = {
          nickName: userData.userInfo.nickName || '無界用户',
          avatarUrl: avatarUrl,
          userType: userData.userType || 'normal',
          badge: userData.badge || null,
          profile: userData.profile || {},
          phoneNumber: userData.phoneNumber || ''  // ✅ 添加 phoneNumber
        };
        
        console.log('✅ 构建的完整用户信息:', fullUserInfo);
        console.log('✅ 认证状态:', fullUserInfo.profile.certificationStatus);
        
        this.setData({
          userInfo: fullUserInfo
        });
        
        app.globalData.userInfo = fullUserInfo;
        app.globalData.userType = fullUserInfo.userType;
        wx.setStorageSync('userInfo', fullUserInfo);
        wx.setStorageSync('userType', fullUserInfo.userType);
        
        console.log('✅ 完整用户信息已加载并保存');
      }
    }).catch(err => {
      console.error('❌ 加载用户信息失败:', err);
      const currentUserInfo = this.data.userInfo;
      if (!currentUserInfo.avatarUrl || currentUserInfo.avatarUrl.trim() === '') {
        this.setData({
          'userInfo.avatarUrl': '/images/zhi.png'
        });
      }
    });
  },

  navigateToEditProfile: function () {
    wx.navigateTo({
      url: '/pages/edit-profile/index',
    });
  },

  onAvatarError: function (e) {
    console.error('⚠️ 头像加载失败:', e.detail);
    console.error('⚠️ 当前头像URL:', this.data.userInfo.avatarUrl);
    
    this.setData({
      'userInfo.avatarUrl': '/images/zhi.png'
    });
    
    const userInfo = this.data.userInfo;
    userInfo.avatarUrl = '/images/zhi.png';
    app.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
    
    console.log('✅ 已切换到默认头像');
  },

  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/index',
    });
  },

  handleLogout: function () {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          // ✅ 清除所有登录相关数据
          wx.removeStorageSync('openid');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('userType');
          
          app.globalData.openid = null;
          app.globalData.userInfo = null;
          app.globalData.userType = null;
          app.globalData.hasLogin = false;

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
          });

          this.setData({
            isLoggedIn: false,
            userInfo: {},
            posts: [],
            stats: {
              following: 0,
              followers: 0,
              likes: 0,
            },
            hasMore: true,
            page: 1,
          });
        }
      },
    });
  },

  loadStats: function () {
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid) {
      this.setData({
        stats: {
          following: 0,
          followers: 0,
          likes: 0,
        },
      });
      return;
    }

    // 使用关注工具类加载统计数据
    followUtil.getFollowStats(openid)
      .then(stats => {
        console.log('✅ 关注统计:', stats);
        this.setData({
          'stats.following': stats.following,
          'stats.followers': stats.followers,
          'stats.likes': stats.likes || 0
        });
      })
      .catch(err => {
        console.error('❌ 加载关注统计失败:', err);
        this.setData({
          'stats.following': 0,
          'stats.followers': 0,
          'stats.likes': 0
        });
      });

    // 加载获赞数
    // likes are returned by getUserPublicStats through followUtil.getFollowStats.
  },

  loadLikesCount: function(openid) {
    return wx.cloud.callFunction({
      name: "getUserPublicStats",
      data: { targetId: openid }
    })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const stats = res.result.data || {};
        this.setData({ "stats.likes": stats.likes || 0 });
      })
      .catch((err) => {
        console.error('加载获赞数失败:', err);
        this.setData({ "stats.likes": 0 });
      });
  },

  loadPosts: function (refresh) {
    if (this.data.loading) return;
    if (!this.data.hasMore && !refresh) return;

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid) {
      this.setData({
        posts: [],
        hasMore: false,
        loading: false,
        emptyText: "登录后查看内容",
      });
      return;
    }

    const nextPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    if (this.data.currentTab === 0) {
      this.loadMyPosts(nextPage, refresh);
      return;
    }
    if (this.data.currentTab === 1) {
      this.loadCollectedPosts(nextPage, refresh);
      return;
    }
    this.loadLikedPosts(nextPage, refresh);
  },

  loadMyPosts: function (page, refresh) {
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    return wx.cloud
      .callFunction({
        name: "getPublicData",
        data: {
          collection: "posts",
          page: page,
          pageSize: this.data.pageSize,
          orderBy: "createTime",
          order: "desc",
          fieldMode: "list",
          authorOpenids: [openid],
        },
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const raw = res.result.data || [];
        const mapped = raw.map((item) =>
          this.buildPostItemFromDoc(item, "posts"),
        );
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(
          res.result.pagination && res.result.pagination.hasMore
        );
        this.setData({
          posts,
          page: page,
          hasMore,
          loading: false,
          emptyText: "暂无笔记",
        });
      })
      .catch((err) => {
        console.error('加载笔记失败:', err);
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  loadCollectedPosts: function (page, refresh) {
    const currentOpenid = app.globalData.openid || wx.getStorageSync("openid");
    if (!currentOpenid) {
      this.setData({ loading: false, posts: [], hasMore: false });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: "getUserActions",
      data: {
        targetId: currentOpenid,
        type: "collect",
        page,
        pageSize: this.data.pageSize
      }
    })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const mapped = res.result.data || [];
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(res.result.pagination && res.result.pagination.hasMore);
        this.setData({
          posts,
          page: page,
          hasMore,
          loading: false,
          emptyText: "暂无收藏",
        });
      })
      .catch((err) => {
        console.error('加载收藏失败:', err);
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  loadLikedPosts: function (page, refresh) {
    const currentOpenid = app.globalData.openid || wx.getStorageSync("openid");
    if (!currentOpenid) {
      this.setData({ loading: false, posts: [], hasMore: false });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: "getUserActions",
      data: {
        targetId: currentOpenid,
        type: "like",
        page,
        pageSize: this.data.pageSize
      }
    })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const mapped = res.result.data || [];
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(res.result.pagination && res.result.pagination.hasMore);
        this.setData({
          posts,
          page: page,
          hasMore,
          loading: false,
          emptyText: "暂无赞过",
        });
      })
      .catch((err) => {
        console.error('加载赞过失败:', err);
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  formatPostTag: function (doc) {
    const subtypeText = Array.isArray(doc.recognizedSubtypes) && doc.recognizedSubtypes.length
      ? doc.recognizedSubtypes.join('、')
      : doc.recognizedSubtype;
    if (doc.recognizedCategory && subtypeText) {
      return `${doc.recognizedCategory} / ${subtypeText}`;
    }
    return doc.recognizedCategory || doc.categoryName || doc.category || '';
  },

  buildPostItemFromDoc: function (doc, collection) {
    const titleSource = doc.title || doc.description || doc.content || "";
    const title = this.normalizeTitle(titleSource);
    const image = this.pickImage(doc);
    const hasImage = !!image;  // ✅ 判断是否有图片
    const stats = doc.stats || {};
    const likes = typeof stats.like === "number" ? stats.like : 0;
    return {
      id: doc._id,
      title,
      tag: this.formatPostTag(doc),
      image: image || "/images/24213.jpg",
      hasImage: hasImage,  // ✅ 添加 hasImage 字段
      likes,
      route:
        collection === "solutions"
          ? "/pages/solution-detail/index"
          : "/pages/post-detail/index",
      collection,
    };
  },

  normalizeTitle: function (value) {
    const text = String(value || "").trim();
    if (!text) return "未命名内容";
    return text.split("\n")[0].slice(0, 40);
  },

  pickImage: function (doc) {
    if (!doc) return "";
    if (doc.image) return doc.image;
    if (doc.coverImg) return doc.coverImg;
    if (doc.beforeImg) return doc.beforeImg;
    if (doc.imageUrl) return doc.imageUrl;
    if (doc.coverImage) return doc.coverImage;
    if (doc.afterImg) return doc.afterImg;
    if (Array.isArray(doc.images) && doc.images.length > 0)
      return doc.images[0];
    return "";
  },

  convertCloudImages: function (list) {
    const items = list || [];
    const cloudUrls = items
      .map((item) => item.image)
      .filter(
        (url) => typeof url === "string" && url.indexOf("cloud://") === 0,
      );
    if (cloudUrls.length === 0) return Promise.resolve(items);

    const unique = Array.from(new Set(cloudUrls));
    return wx.cloud
      .getTempFileURL({ fileList: unique })
      .then((res) => {
        const mapping = new Map();
        (res.fileList || []).forEach((file) => {
          if (file.fileID && file.tempFileURL) {
            mapping.set(file.fileID, file.tempFileURL);
          }
        });
        return items.map((item) => ({
          ...item,
          image: mapping.get(item.image) || item.image,
        }));
      })
      .catch(() => items);
  },

  onTabTap: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index }, () => {
      this.setData(
        {
          page: 1,
          posts: [],
          hasMore: true,
        },
        () => this.loadPosts(true),
      );
    });
  },

  navigateToFollowList: function (e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/follow-list/index?type=${type}`,
    });
  },

  navigateToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const route = e.currentTarget.dataset.route || "/pages/post-detail/index";
    if (!id) return;
    const url =
      route.indexOf("?") > -1 ? `${route}&id=${id}` : `${route}?id=${id}`;
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
        console.log('???????');
      },
      fail: (err) => {
        console.error('拨号失败:', err);
        wx.showToast({
          title: '拨号失败',
          icon: 'none'
        });
      }
    });
  },

  onPullDownRefresh: function () {
    this.setData(
      {
        page: 1,
        posts: [],
        hasMore: true,
      },
      () => {
        Promise.resolve(this.loadPosts(true)).finally(() => {
          wx.stopPullDownRefresh();
        });
      },
    );
  },

  onReachBottom: function () {
    if (this.data.isLoggedIn) {
      this.loadPosts(false);
    }
  },
});
