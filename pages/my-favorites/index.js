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

    // 从actions集合获取收藏记录
    db.collection("actions")
      .where({
        _openid: openid,
        type: "collect",
      })
      .orderBy("createTime", "desc")
      .get()
      .then((res) => {
        const favoritesList = res.data.map((item) => ({
          _id: item._id,
          postId: item.postId,
          title: item.title || "未命名项目",
          image: item.image || "../../images/default-avatar.png",
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
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/pages/answer/answer?id=" + postId,
    });
  },
});
