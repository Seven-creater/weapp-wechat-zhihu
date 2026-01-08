// 我的评论列表页
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    commentsList: [],
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

    // 查询评论列表
    this.loadCommentsList(openid);
  },

  // 加载评论列表
  loadCommentsList: function (openid) {
    const that = this;
    that.setData({ loading: true });

    // 从comments集合获取评论记录
    db.collection("comments")
      .where({
        _openid: openid,
      })
      .orderBy("createTime", "desc")
      .get()
      .then((res) => {
        const commentsList = res.data.map((item) => ({
          _id: item._id,
          postId: item.postId,
          content: item.content,
          postTitle: item.postTitle || "文章标题",
        }));

        that.setData({
          commentsList: commentsList,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("获取评论列表失败:", err);
        that.setData({ loading: false });
        wx.showToast({ title: "获取评论列表失败", icon: "none" });
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
