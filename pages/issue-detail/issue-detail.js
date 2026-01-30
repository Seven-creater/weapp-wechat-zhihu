// pages/issue-detail/issue-detail.js

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
    issue: null,
    loading: false,
  },

  onLoad: function (options) {
    const issueId = options.id;
    if (issueId) {
      this.loadIssue(issueId);
    }
  },

  loadIssue: function (issueId) {
    this.setData({ loading: true });

    const db = getDB();

    db.collection("issues")
      .doc(issueId)
      .get()
      .then((res) => {
        const issue = res.data || null;
        this.setData({
          issue: issue
            ? {
                ...issue,
                createTime: this.formatTime(issue.createTime),
              }
            : null,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("加载问题详情失败:", err);
        this.setData({ loading: false });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      });
  },

  formatTime: function (timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  previewImage: function (e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    const issue = this.data.issue || {};
    const urls = Array.isArray(issue.images) && issue.images.length > 0
      ? issue.images
      : [src];
    wx.previewImage({
      current: src,
      urls
    });
  },

  goBack: function () {
    wx.navigateBack();
  },

  goToRenovation: function() {
    const issueId = this.data.issue?._id;
    const diagnosis = encodeURIComponent((this.data.issue && this.data.issue.aiSolution) || "");
    wx.navigateTo({
      url: `/pages/renovation/renovation?issueId=${issueId || ""}&diagnosis=${diagnosis}`
    });
  }
});
