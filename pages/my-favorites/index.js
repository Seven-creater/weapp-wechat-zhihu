// 我的收藏列表页
const app = getApp();

// 延迟初始化数据库
let db = null;
let _ = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
    _ = db.command;
  }
  return { db, _ };
};

Page({
  data: {
    favoritesList: [],
    loading: false,
  },

  onLoad: function () {
    this.ensureLoginAndLoad();
  },

  onShow: function () {
    this.ensureLoginAndLoad();
  },

  ensureLoginAndLoad: function () {
    app
      .checkLogin()
      .then(() => {
        this.loadFavoritesList();
      })
      .catch(() => {
        wx.showToast({ title: "请先登录", icon: "none" });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
  },

  // 加载收藏列表
  loadFavoritesList: function () {
    const that = this;
    that.setData({ loading: true });

    // 调用云函数获取收藏列表（解决图片权限和时间格式化问题）
    wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "actions",
        page: 1,
        pageSize: 50,
        orderBy: "createTime",
        order: "desc",
      },
      success: (res) => {
        that.setData({ loading: false });

        if (res.result && res.result.success) {
          const favoritesList = res.result.data.map((item) => {
            const normalizedType = item.type || "collect_post";
            return {
              _id: item._id,
              targetId: item.targetId || item.postId,
              title: item.title || "未命名项目",
              image: item.image || item.coverImg || "",
              type: normalizedType,
              targetRoute: item.targetRoute,
              formatTime: item.formatTime || "",
              createTime: item.createTime,
            };
          });

          that.setData({
            favoritesList: favoritesList,
          });

          console.log("收藏列表加载完成，共", favoritesList.length, "条");
        } else {
          wx.showToast({
            title: res.result?.error || "获取收藏列表失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        that.setData({ loading: false });
        console.error("获取收藏列表失败:", err);
        wx.showToast({ title: "获取收藏列表失败", icon: "none" });
      },
    });
  },

  // 跳转到详情页
  goToDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.favoritesList[index];

    if (!item || !item.targetId) {
      wx.showToast({ title: "数据异常", icon: "none" });
      return;
    }

    // 根据类型跳转到不同的详情页
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

    wx.navigateTo({
      url: targetUrl,
    });
  },
});
