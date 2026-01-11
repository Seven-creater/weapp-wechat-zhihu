// pages/my-issues/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    currentTab: "issues",
    issues: [],
    posts: [],
    loading: true,
    issuesPage: 1,
    postsPage: 1,
    limit: 10,
    issuesHasMore: true,
    postsHasMore: true,
  },

  onLoad: function (options) {
    this.checkLoginAndLoad();
  },

  onShow: function () {
    // 页面显示时重新检查登录并加载数据
    this.checkLoginAndLoad();
  },

  onPullDownRefresh: function () {
    this.setData({
      issuesPage: 1,
      postsPage: 1,
      issues: [],
      posts: [],
      issuesHasMore: true,
      postsHasMore: true,
    });
    const currentTab = this.data.currentTab;
    const promise =
      currentTab === "issues" ? this.loadMyIssues() : this.loadMyPosts();
    promise.then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.currentTab === "issues") {
      if (this.data.issuesHasMore && !this.data.loading) {
        this.loadMoreIssues();
      }
    } else {
      if (this.data.postsHasMore && !this.data.loading) {
        this.loadMorePosts();
      }
    }
  },

  checkLoginAndLoad: function () {
    const that = this;
    return new Promise((resolve, reject) => {
      const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");
      const openid = app.globalData.openid || wx.getStorageSync("openid");

      console.log("当前登录状态:", { userInfo: !!userInfo, openid: !!openid });

      if (userInfo && openid) {
        app.globalData.userInfo = userInfo;
        app.globalData.openid = openid;
        console.log("=== checkLoginAndLoad 内部 ===");
        console.log("currentTab:", that.data.currentTab);
        console.log("openid:", openid);

        if (that.data.currentTab === "issues") {
          console.log("调用 loadMyIssues");
          that.loadMyIssues();
        } else {
          console.log("调用 loadMyPosts");
          that.loadMyPosts();
        }
        resolve(true);
      } else {
        that.setData({ loading: false });
        wx.showModal({
          title: "未登录",
          content: "请先登录以查看您的发布记录",
          showCancel: false,
          confirmText: "去登录",
          success: (res) => {
            if (res.confirm) {
              app
                .login()
                .then(() => {
                  if (that.data.currentTab === "issues") {
                    that.loadMyIssues();
                  } else {
                    that.loadMyPosts();
                  }
                })
                .catch((err) => {
                  console.error("登录失败:", err);
                  that.setData({ loading: false });
                });
            } else {
              that.setData({ loading: false });
            }
          },
        });
        reject(false);
      }
    });
  },

  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      loading: true,
      issuesPage: 1,
      postsPage: 1,
    });

    if (tab === "issues") {
      this.setData({ issues: [], issuesHasMore: true });
      this.loadMyIssues();
    } else {
      this.setData({ posts: [], postsHasMore: true });
      this.loadMyPosts();
    }
  },

  loadMyIssues: function () {
    const { issuesPage, limit } = this.data;
    const skip = (issuesPage - 1) * limit;
    const openid = app.globalData.openid || wx.getStorageSync("openid");

    console.log("=== loadMyIssues 调试信息 ===");
    console.log("globalData.openid:", app.globalData.openid);
    console.log("storage openid:", wx.getStorageSync("openid"));
    console.log("使用的openid:", openid);

    if (!openid) {
      console.log("没有openid，返回空数据");
      this.setData({ issues: [], loading: false, issuesHasMore: false });
      return Promise.resolve();
    }

    return db
      .collection("issues")
      .where({ _openid: openid })
      .orderBy("createTime", "desc")
      .skip(skip)
      .limit(limit)
      .get()
      .then((res) => {
        console.log("查询结果数量:", res.data.length);
        console.log("查询结果数据:", JSON.stringify(res.data, null, 2));

        const newIssues = res.data.map((issue) => {
          // 兼容 aiAnalysis 和 aiSolution 字段
          const aiText = issue.aiAnalysis || issue.aiSolution || "";
          // 截取前30个字作为摘要
          const aiSummary =
            aiText.length > 30
              ? aiText.substring(0, 30) + "..."
              : aiText || "AI正在分析中...";

          return {
            ...issue,
            createTime: this.formatTime(issue.createTime),
            aiSummary: aiSummary,
          };
        });
        const issues =
          issuesPage === 1 ? newIssues : [...this.data.issues, ...newIssues];
        this.setData({
          issues,
          issuesHasMore: newIssues.length === limit,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("加载路障反馈数据失败:", err);
        this.setData({ issues: [], loading: false, issuesHasMore: false });
        wx.showToast({ title: "加载失败: " + err.errMsg, icon: "none" });
      });
  },

  loadMyPosts: function () {
    const { postsPage, limit } = this.data;
    const skip = (postsPage - 1) * limit;
    const openid = app.globalData.openid || wx.getStorageSync("openid");

    if (!openid) {
      this.setData({ posts: [], loading: false, postsHasMore: false });
      return Promise.resolve();
    }

    return db
      .collection("posts")
      .where({ _openid: openid })
      .orderBy("createTime", "desc")
      .skip(skip)
      .limit(limit)
      .get()
      .then((res) => {
        const newPosts = res.data.map((post) => {
          // 处理摘要：如果content存在，截取前30个字；否则显示"分享了一张图片"
          const contentText = post.content || "";
          const summary =
            contentText.length > 30
              ? contentText.substring(0, 30) + "..."
              : contentText || "分享了一张图片";

          return {
            ...post,
            createTime: this.formatTime(post.createTime),
            stats: post.stats || { like: 0, comment: 0 },
            summary: summary, // 添加摘要字段
          };
        });
        const posts =
          postsPage === 1 ? newPosts : [...this.data.posts, ...newPosts];
        this.setData({
          posts,
          postsHasMore: newPosts.length === limit,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("加载社区帖子数据失败:", err);
        this.setData({ posts: [], loading: false, postsHasMore: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      });
  },

  loadMoreIssues: function () {
    if (!this.data.issuesHasMore || this.data.loading) return;
    this.setData({ issuesPage: this.data.issuesPage + 1 });
    this.loadMyIssues();
  },

  loadMorePosts: function () {
    if (!this.data.postsHasMore || this.data.loading) return;
    this.setData({ postsPage: this.data.postsPage + 1 });
    this.loadMyPosts();
  },

  goToIssueDetail: function (e) {
    const issueId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/solution-detail/index?id=${issueId}&collection=issues`,
    });
  },

  goToPostDetail: function (e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) {
      console.error("postId is undefined", e.currentTarget.dataset);
      wx.showToast({
        title: "帖子ID无效",
        icon: "none",
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${postId}`,
    });
  },

  goToHome: function () {
    wx.switchTab({ url: "/pages/index/index" });
  },

  formatTime: function (timestamp) {
    if (!timestamp) return "";

    let date;

    if (typeof timestamp === "object") {
      if (timestamp.$date) {
        date = new Date(timestamp.$date);
      } else if (timestamp.getTime) {
        date = timestamp;
      } else {
        return timestamp.toString() || "";
      }
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 24 * 60 * 60 * 1000) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `今天 ${hours}:${minutes}`;
    }
    if (diff < 48 * 60 * 60 * 1000) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `昨天 ${hours}:${minutes}`;
    }
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  onShareAppMessage: function () {
    return {
      title: "我的发布历史",
      path: "/pages/my-issues/index",
    };
  },
});
