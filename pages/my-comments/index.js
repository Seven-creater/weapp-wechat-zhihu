// 我的评论列表页
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    commentsList: [],
    loading: true,
  },

  onLoad: function () {
    this.loadCommentsList();
  },

  // 加载评论列表
  loadCommentsList: function () {
    const that = this;
    this.setData({ loading: true });

    // 检查登录状态
    app
      .checkLogin()
      .then(() => {
        const openid = app.globalData.openid;

        // 从comments集合获取当前用户的评论
        db.collection("comments")
          .where({
            _openid: openid,
          })
          .orderBy("createTime", "desc")
          .get()
          .then((res) => {
            const comments = res.data;

            // 格式化评论列表，直接使用comments集合中的postTitle字段
            const commentsList = comments.map((comment) => ({
              _id: comment._id,
              postId: comment.postId,
              content: comment.content,
              postTitle: comment.postTitle || "文章标题",
              createTime: that.formatTime(comment.createTime),
            }));

            that.setData({ commentsList, loading: false });
          })
          .catch((err) => {
            console.error("获取评论列表失败:", err);
            that.setData({ loading: false });
            wx.showToast({ title: "获取评论列表失败", icon: "none" });
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
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 跳转到详情页
  goToDetail: function (e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/pages/case-detail/case-detail?postId=" + postId,
    });
  },
});
