// pages/mine/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: {},
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
    this.checkLoginAndLoad();
  },

  onShow: function () {
    const storedUser = wx.getStorageSync("userInfo");
    if (storedUser) {
      this.setData({ userInfo: storedUser });
    }
    if (app.globalData.userInfo || storedUser) {
      this.loadStats();
      this.loadPosts(true);
    }
  },

  checkLoginAndLoad: function () {
    app
      .checkLogin()
      .then(() => {
        this.setData({ userInfo: app.globalData.userInfo });
        this.loadStats();
        this.loadPosts(true);
      })
      .catch(() => {
        this.setData({
          userInfo: {},
          posts: [],
          hasMore: false,
          loading: false,
          stats: {
            following: 0,
            followers: 0,
            likes: 0,
          },
          emptyText: "登录后查看内容",
        });
      });
  },

  handleLogin: function () {
    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");
    if (userInfo) {
      wx.navigateTo({
        url: "/pages/mine/profile-edit/index",
      });
      return;
    }
    app
      .login()
      .then(({ userInfo }) => {
        this.setData({ userInfo });
        this.loadStats();
        this.loadPosts(true);
      })
      .catch((err) => {
        console.error("登录失败", err);
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

    db.collection("follows")
      .where({
        followerId: openid,
      })
      .count()
      .then((res) => {
        this.setData({ "stats.following": res.total || 0 });
      })
      .catch(() => {
        this.setData({ "stats.following": 0 });
      });

    db.collection("follows")
      .where({
        targetId: openid,
      })
      .count()
      .then((res) => {
        this.setData({ "stats.followers": res.total || 0 });
      })
      .catch(() => {
        this.setData({ "stats.followers": 0 });
      });

    this.sumMyPostStats(openid)
      .then((total) => {
        this.setData({ "stats.likes": total });
      })
      .catch(() => {
        this.setData({ "stats.likes": 0 });
      });
  },

  sumMyPostStats: async function (openid) {
    let total = 0;
    let page = 0;
    const pageSize = 100;
    while (page < 5) {
      const res = await db
        .collection("posts")
        .where({ _openid: openid })
        .skip(page * pageSize)
        .limit(pageSize)
        .get();
      const list = res.data || [];
      list.forEach((item) => {
        const stats = item.stats || {};
        const likeCount = typeof stats.like === "number" ? stats.like : 0;
        const collectCount =
          typeof stats.collect === "number" ? stats.collect : 0;
        total += likeCount + collectCount;
      });
      if (list.length < pageSize) break;
      page += 1;
    }
    return total;
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
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  loadLikedPosts: function (page, refresh) {
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
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  hydrateActionItems: async function (list) {
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
    this.loadPosts(false);
  },
});
