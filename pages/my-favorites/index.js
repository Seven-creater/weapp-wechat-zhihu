// 我的收藏列表页
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    favoritesList: [],
    loading: true,
  },

  onLoad: function () {
    this.loadFavoritesList();
  },

  // 加载收藏列表
  loadFavoritesList: function () {
    const that = this;
    this.setData({ loading: true });

    // 检查登录状态
    app
      .checkLogin()
      .then(() => {
        const openid = app.globalData.openid;

        // 从actions集合获取收藏的postId
        db.collection("actions")
          .where({
            _openid: openid,
            type: "collect_post",
          })
          .orderBy("createTime", "desc")
          .get()
          .then((res) => {
            const collectedActions = res.data;

            if (collectedActions.length === 0) {
              that.setData({ favoritesList: [], loading: false });
              return;
            }

            // 获取所有postId
            const postIds = collectedActions.map((action) => action.postId);

            // 使用actions集合中存储的文章标题和封面图
            const favoritesList = collectedActions.map((action) => ({
              _id: action._id,
              postId: action.postId,
              title: action.title || "未命名项目",
              subtitle: action.subtitle || "",
              image: action.coverImg || "/images/default-avatar.png",
              createTime: that.formatTime(action.createTime),
            }));

            that.setData({ favoritesList, loading: false });
          })
          .catch((err) => {
            console.error("获取收藏列表失败:", err);
            that.setData({ loading: false });
            wx.showToast({ title: "获取收藏列表失败", icon: "none" });
          });
      })
      .catch(() => {
        // 未登录，跳转到登录页面
        wx.showToast({ title: "请先登录", icon: "none" });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
  },

  // 格式化时间
  formatTime: function (timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  // 跳转到详情页
  goToDetail: function (e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/pages/case-detail/case-detail?postId=" + postId,
    });
  },
});
