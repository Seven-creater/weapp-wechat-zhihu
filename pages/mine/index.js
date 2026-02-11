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

  onShow: function () {
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

  checkLoginStatus: async function () {
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

  checkIsAdmin: async function(openid) {
    // 🔐 超级管理员列表（硬编码）
    const SUPER_ADMIN_OPENIDS = [
      'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',
      'oOJhu3T9Us9TAnibhfctmyRw2Urc'
    ];
    
    // 1. 首先检查是否是超级管理员
    if (SUPER_ADMIN_OPENIDS.includes(openid)) {
      console.log('✅ 超级管理员权限验证通过:', openid);
      return true;
    }
    
    // 2. 检查数据库中的管理员标识
    try {
      const db = getDB();
      if (!db) return false;
      
      const userQuery = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get();
      
      if (userQuery.data && userQuery.data.length > 0) {
        const user = userQuery.data[0];
        
        // 检查是否有管理员标识或管理员权限
        if (user.isAdmin === true || 
            (user.permissions && user.permissions.canManageUsers === true)) {
          console.log('✅ 数据库管理员权限验证通过:', openid);
          return true;
        }
      }
    } catch (err) {
      console.error('查询管理员权限失败:', err);
    }
    
    console.log('❌ 管理员权限验证失败:', openid);
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
    console.log('🔄 开始加载完整用户信息, openid:', openid);
    
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid
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
          'stats.followers': stats.followers
        });
      })
      .catch(err => {
        console.error('❌ 加载关注统计失败:', err);
        this.setData({
          'stats.following': 0,
          'stats.followers': 0
        });
      });

    // 加载获赞数
    this.loadLikesCount(openid);
  },

  loadLikesCount: function(openid) {
    const db = getDB();
    if (!db) {
      this.setData({ 'stats.likes': 0 });
      return;
    }

    db.collection("posts")
      .where({ _openid: openid })
      .field({ stats: true, _id: true })
      .get()
      .then((res) => {
        const posts = res.data || [];
        const totalLikes = posts.reduce((sum, post) => {
          const likes = (post.stats && post.stats.like) || 0;
          return sum + likes;
        }, 0);
        
        console.log('✅ 总获赞数:', totalLikes);
        this.setData({ "stats.likes": totalLikes });
      })
      .catch((err) => {
        console.error('❌ 加载获赞数失败:', err);
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
    const db = getDB();
    if (!db) {
      console.error('数据库未初始化');
      this.setData({ loading: false });
      return Promise.reject(new Error('数据库未初始化'));
    }

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const types = ["collect_post", "collect_solution", "collect"];
    
    return db
      .collection("actions")
      .where({
        _openid: openid,
        type: db.command.in(types),
      })
      .orderBy("createTime", "desc")
      .skip((page - 1) * this.data.pageSize)
      .limit(this.data.pageSize)
      .get()
      .then((res) => this.hydrateActionItems(res.data || []))
      .then((mapped) => {
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = mapped.length >= this.data.pageSize;
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
    const db = getDB();
    if (!db) {
      console.error('数据库未初始化');
      this.setData({ loading: false });
      return Promise.reject(new Error('数据库未初始化'));
    }

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const types = ["like_post", "like_solution", "like"];
    return db
      .collection("actions")
      .where({
        _openid: openid,
        type: db.command.in(types),
      })
      .orderBy("createTime", "desc")
      .skip((page - 1) * this.data.pageSize)
      .limit(this.data.pageSize)
      .get()
      .then((res) => this.hydrateActionItems(res.data || []))
      .then((mapped) => {
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = mapped.length >= this.data.pageSize;
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

  hydrateActionItems: async function (list) {
    const db = getDB();
    if (!db) {
      console.error('数据库未初始化');
      return [];
    }

    const actions = list || [];
    if (actions.length === 0) return [];
    const byCollection = { posts: [], solutions: [] };
    actions.forEach((item) => {
      const type = String(item.type || "");
      const collection =
        item.targetCollection ||
        (type.indexOf("solution") > -1 ? "solutions" : "posts");
      const targetId = item.targetId || item.postId;
      if (collection && targetId) {
        byCollection[collection].push(targetId);
      }
    });

    const [postsRes, solutionsRes] = await Promise.all([
      byCollection.posts.length
        ? db
            .collection("posts")
            .where({ _id: db.command.in(byCollection.posts) })
            .get()
        : Promise.resolve({ data: [] }),
      byCollection.solutions.length
        ? db
            .collection("solutions")
            .where({ _id: db.command.in(byCollection.solutions) })
            .get()
        : Promise.resolve({ data: [] }),
    ]);

    const postMap = new Map(
      (postsRes.data || []).map((item) => [item._id, item]),
    );
    const solutionMap = new Map(
      (solutionsRes.data || []).map((item) => [item._id, item]),
    );

    const items = actions
      .map((action) => {
        const type = String(action.type || "");
        const collection =
          action.targetCollection ||
          (type.indexOf("solution") > -1 ? "solutions" : "posts");
        const targetId = action.targetId || action.postId;
        const doc =
          collection === "solutions"
            ? solutionMap.get(targetId)
            : postMap.get(targetId);
        
        if (!doc) {
          return null;
        }
        
        const base = this.buildPostItemFromDoc(doc, collection);
        return {
          ...base,
          id: targetId || base.id,
          route:
            base.route ||
            action.targetRoute ||
            (collection === "solutions"
              ? "/pages/solution-detail/index"
              : "/pages/post-detail/index"),
          collection,
        };
      })
      .filter(Boolean);

    return this.convertCloudImages(items);
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
