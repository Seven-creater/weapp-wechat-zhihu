// pages/my-issues/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    issues: [],
    loading: true,
    page: 1,
    limit: 10,
    hasMore: true,
  },

  onLoad: function (options) {
    this.checkLoginAndLoad();
  },

  onShow: function () {
    // 重新加载数据，确保数据最新
    this.setData({
      page: 1,
      issues: [],
      hasMore: true,
    });
    this.loadMyIssues();
  },

  onPullDownRefresh: function () {
    this.setData({
      page: 1,
      issues: [],
      hasMore: true,
    });
    this.loadMyIssues().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 检查登录状态并加载数据
  checkLoginAndLoad: function () {
    app
      .checkLogin()
      .then(() => {
        this.loadMyIssues();
      })
      .catch(() => {
        wx.showModal({
          title: "未登录",
          content: "请先登录以查看您的随手拍记录",
          showCancel: false,
          confirmText: "去登录",
          success: (res) => {
            if (res.confirm) {
              app
                .login()
                .then(() => {
                  this.loadMyIssues();
                })
                .catch(() => {
                  this.setData({ loading: false });
                });
            } else {
              this.setData({ loading: false });
            }
          },
        });
      });
  },

  // 加载我的随手拍数据
  loadMyIssues: function () {
    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });

    const { page, limit } = this.data;
    const skip = (page - 1) * limit;
    const openid = app.globalData.openid || wx.getStorageSync("openid");

    if (!openid) {
      this.setData({
        issues: [],
        loading: false,
        hasMore: false,
      });
      return Promise.resolve();
    }

    return db
      .collection("issues")
      .where({
        _openid: openid,
      })
      .orderBy("createTime", "desc")
      .skip(skip)
      .limit(limit)
      .get()
      .then((res) => {
        const newIssues = res.data.map((issue) => ({
          ...issue,
          createTime: this.formatTime(issue.createTime),
          aiAnalysis: issue.aiSolution || issue.aiAnalysis || "",
        }));

        const issues =
          page === 1 ? newIssues : [...this.data.issues, ...newIssues];

        this.setData({
          issues,
          hasMore: newIssues.length === limit,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("加载随手拍数据失败:", err);
        // 数据库集合不存在时，显示空列表
        this.setData({
          issues: [],
          loading: false,
          hasMore: false,
        });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      });
  },

  // 加载更多
  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;

    this.setData({
      page: this.data.page + 1,
    });
    this.loadMyIssues();
  },

  // 跳转到详情页
  goToDetail: function (e) {
    const issueId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/issue-detail/issue-detail?id=${issueId}`,
    });
  },

  // 跳转到首页
  goToHome: function () {
    wx.switchTab({
      url: "/pages/index/index",
    });
  },

  // 格式化时间
  formatTime: function (timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // 今天内
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `今天 ${hours}:${minutes}`;
    }

    // 昨天
    if (diff < 48 * 60 * 60 * 1000) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `昨天 ${hours}:${minutes}`;
    }

    // 一周内
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }

    // 更早的时间
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  // 分享功能
  onShareAppMessage: function () {
    return {
      title: "我的无障碍随手拍记录",
      path: "/pages/my-issues/index",
    };
  },
});
