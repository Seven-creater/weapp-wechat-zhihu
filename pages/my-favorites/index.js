// 我的收藏列表页
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    favoritesList: [],
    loading: false,
  },

  onLoad: function () {
    // 获取openid
    const openid = wx.getStorageSync("openid");
    if (!openid) {
      wx.showToast({ title: "请先登录", icon: "none" });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    // 查询收藏列表
    this.loadFavoritesList(openid);
  },

  // 加载收藏列表
  loadFavoritesList: function (openid) {
    const that = this;
    that.setData({ loading: true });

    // 从actions集合获取收藏记录，支持多种类型
    // 注意：_openid 由微信云开发系统自动处理，不需要手动设置
    db.collection("actions")
      .where({
        type: db.command.in(["collect_solution", "collect_post"]),
      })
      .orderBy("createTime", "desc")
      .get()
      .then((res) => {
        const favoritesList = res.data.map((item) => ({
          _id: item._id,
          targetId: item.targetId,
          title: item.title || "未命名项目",
          image: item.image || "../../images/default-avatar.png",
          type: item.type,
          targetRoute: item.targetRoute,
          createTime: item.createTime,
        }));

        that.setData({
          favoritesList: favoritesList,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("获取收藏列表失败:", err);
        that.setData({ loading: false });
        wx.showToast({ title: "获取收藏列表失败", icon: "none" });
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
        targetUrl = "/pages/solution-detail/index?solutionId=" + item.targetId;
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
