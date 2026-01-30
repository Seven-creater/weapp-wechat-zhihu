// pages/mine/index.js
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
    this.checkLoginStatus();
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function () {
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");

    if (openid && userInfo) {
      // 已登录
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
      });
      this.loadStats();
      this.loadPosts(true);
    } else {
      // 未登录
      this.setData({
        isLoggedIn: false,
        userInfo: {},
        posts: [],
        stats: {
          following: 0,
          followers: 0,
          likes: 0,
        },
      });
    }
  },

  /**
   * 跳转到编辑资料页面
   */
  navigateToEditProfile: function () {
    wx.navigateTo({
      url: '/pages/edit-profile/index',
    });
  },

  /**
   * 处理登录
   */
  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/index',
    });
  },

  /**
   * 退出登录
   */
  handleLogout: function () {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          // 清除登录状态（openid）
          wx.removeStorageSync('openid');
          app.globalData.openid = null;
          app.globalData.hasLogin = false;

          // 注意：保留 userInfo（头像和昵称），这样重新登录时可以恢复
          // 如果要完全清除，取消下面两行的注释：
          // wx.removeStorageSync('userInfo');
          // app.globalData.userInfo = null;

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
          });

          // 清空页面显示
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

    console.log('========================================');
    console.log('🔍 我的页面：开始加载统计数据');
    console.log('当前用户 openid:', openid);
    console.log('========================================');

    // 🔥 优先从 users 集合的 stats 字段读取（最准确）
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: { targetId: openid }
    }).then(res => {
      console.log('========================================');
      console.log('📊 getUserInfo 云函数返回结果:');
      console.log('完整结果:', JSON.stringify(res.result, null, 2));
      console.log('========================================');
      
      if (res.result && res.result.success && res.result.data && res.result.data.stats) {
        const stats = res.result.data.stats;
        console.log('✅ 找到 stats 数据:', stats);
        console.log('followingCount:', stats.followingCount);
        console.log('followersCount:', stats.followersCount);
        console.log('likesCount:', stats.likesCount);
        
        this.setData({
          'stats.following': stats.followingCount || 0,
          'stats.followers': stats.followersCount || 0,
          'stats.likes': stats.likesCount || 0,
        }, () => {
          console.log('========================================');
          console.log('✅ setData 完成，当前页面 stats:', this.data.stats);
          console.log('========================================');
        });
      } else {
        console.log('❌ 未找到 stats 数据，使用降级方案');
        console.log('res.result:', res.result);
        // 降级方案：实时查询
        this.loadStatsFromCollections(openid);
      }
    }).catch(err => {
      console.error('========================================');
      console.error('❌ 加载统计数据失败，使用降级方案');
      console.error('错误:', err);
      console.error('========================================');
      this.loadStatsFromCollections(openid);
    });
  },

  // 🔥 降级方案：从各个集合实时查询统计数据
  loadStatsFromCollections: function(openid) {
    const db = getDB();
    if (!db) {
      console.error('数据库未初始化');
      this.setData({
        stats: {
          following: 0,
          followers: 0,
          likes: 0,
        },
      });
      return;
    }

    // 加载关注数
    db.collection("follows")
      .where({
        followerId: openid,
      })
      .count()
      .then((res) => {
        this.setData({ "stats.following": res.total || 0 });
      })
      .catch((err) => {
        console.error('加载关注数失败:', err);
        this.setData({ "stats.following": 0 });
      });

    // 加载粉丝数
    db.collection("follows")
      .where({
        targetId: openid,
      })
      .count()
      .then((res) => {
        this.setData({ "stats.followers": res.total || 0 });
      })
      .catch((err) => {
        console.error('加载粉丝数失败:', err);
        this.setData({ "stats.followers": 0 });
      });

    // 🔥 加载获赞数（我的帖子被点赞的总数）
    db.collection("posts")
      .where({ _openid: openid })
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
    return wx.cloud
      .callFunction({
        name: "getPublicData",
        data: {
          collection: "actions",
          page: page,
          pageSize: this.data.pageSize,
          orderBy: "createTime",
          order: "desc",
        },
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }
        const raw = res.result.data || [];
        const hasMore = !!(
          res.result.pagination && res.result.pagination.hasMore
        );
        return this.hydrateActionItems(raw).then((mapped) => ({
          mapped,
          hasMore,
        }));
      })
      .then(({ mapped, hasMore }) => {
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
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

    const items = actions.map((action) => {
      const type = String(action.type || "");
      const collection =
        action.targetCollection ||
        (type.indexOf("solution") > -1 ? "solutions" : "posts");
      const targetId = action.targetId || action.postId;
      const doc =
        collection === "solutions"
          ? solutionMap.get(targetId)
          : postMap.get(targetId);
      const base = doc
        ? this.buildPostItemFromDoc(doc, collection)
        : this.buildPostItemFromAction(action);
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
    });

    return this.convertCloudImages(items);
  },

  buildPostItemFromDoc: function (doc, collection) {
    const titleSource = doc.title || doc.description || doc.content || "";
    const title = this.normalizeTitle(titleSource);
    const image = this.pickImage(doc) || "/images/24213.jpg";
    const stats = doc.stats || {};
    const likes = typeof stats.like === "number" ? stats.like : 0;
    return {
      id: doc._id,
      title,
      image,
      likes,
      route:
        collection === "solutions"
          ? "/pages/solution-detail/index"
          : "/pages/post-detail/index",
      collection,
    };
  },

  buildPostItemFromAction: function (action) {
    const title = this.normalizeTitle(action.title || "");
    const image = action.image || "/images/24213.jpg";
    const route = action.targetRoute || "/pages/post-detail/index";
    return {
      id: action.targetId || action.postId,
      title: title || "已收藏",
      image,
      likes: 0,
      route,
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
