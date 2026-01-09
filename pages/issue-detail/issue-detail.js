// pages/issue-detail/issue-detail.js
const db = wx.cloud.database();

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
    wx.previewImage({
      urls: [src],
    });
  },

  goBack: function () {
    wx.navigateBack();
  },
});
