// 我的评论列表页
const app = getApp();

// 延迟初始化数据库
let db = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
  }
  return db;
};

Page({
  data: {
    commentsList: [],
    loading: false,
  },

  onLoad: function () {
    app
      .checkLogin()
      .then(() => {
        const openid = app.globalData.openid || wx.getStorageSync("openid");
        if (!openid) {
          this.setData({ loading: false });
          return;
        }
        this.loadCommentsList(openid);
      })
      .catch(() => {
        wx.showToast({ title: "请先登录", icon: "none" });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
  },

  // 加载评论列表
  loadCommentsList: function (openid) {
    const that = this;
    that.setData({ loading: true });

    const db = getDB();

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
      url: "/pages/post-detail/index?postId=" + postId,
    });
  },
});
