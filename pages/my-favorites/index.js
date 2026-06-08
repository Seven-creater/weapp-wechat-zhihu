// pages/my-favorites/index.js
const app = getApp();

const PAGE_TTL_MS = 30 * 1000;

Page({
  data: {
    favoritesList: [],
    loading: false,
    inflight: false,
    dirty: true,
    lastLoadedAt: 0
  },

  onLoad() {
    this.ensureLoginAndLoad({ force: true });
  },

  onShow() {
    this.ensureLoginAndLoad();
  },

  ensureLoginAndLoad(options = {}) {
    const force = !!options.force;
    const now = Date.now();
    const expired = now - (this.data.lastLoadedAt || 0) > PAGE_TTL_MS;
    if (!force && (this.data.inflight || (!this.data.dirty && !expired))) {
      return Promise.resolve();
    }

    this.setData({ inflight: true });
    return app.checkLogin()
      .then(() => this.loadFavoritesList())
      .then(() => {
        this.setData({
          dirty: false,
          lastLoadedAt: Date.now()
        });
      })
      .catch(() => {
        wx.showToast({ title: "请先登录", icon: "none" });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      })
      .finally(() => {
        this.setData({ inflight: false });
      });
  },

  loadFavoritesList() {
    this.setData({ loading: true });
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    return wx.cloud.callFunction({
      name: "getUserActions",
      data: {
        targetId: openid,
        type: "collect",
        page: 1,
        pageSize: 50
      }
    }).then((res) => {
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || "获取收藏列表失败");
      }

      const favoritesList = (res.result.data || []).map((item) => {
        const normalizedType = item.collection === "solutions" ? "collect_solution" : "collect_post";
        return {
          _id: item.id,
          targetId: item.id,
          title: item.title || "未命名项目",
          image: item.image || "",
          type: normalizedType,
          targetRoute: item.route,
          formatTime: item.formatTime || "",
          createTime: item.createTime
        };
      });

      this.setData({ favoritesList });
    }).catch((err) => {
      console.error("获取收藏列表失败:", err);
      wx.showToast({ title: err.message || "获取收藏列表失败", icon: "none" });
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  goToDetail(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.favoritesList[index];
    if (!item || !item.targetId) {
      wx.showToast({ title: "数据异常", icon: "none" });
      return;
    }

    let targetUrl = "";
    switch (item.type) {
      case "collect_solution":
        targetUrl = "/pages/solution-detail/index?id=" + item.targetId;
        break;
      case "collect_post":
        targetUrl = "/pages/post-detail/index?postId=" + item.targetId;
        break;
      default:
        wx.showToast({ title: "暂不支持的类型", icon: "none" });
        return;
    }

    wx.navigateTo({ url: targetUrl });
  }
});
