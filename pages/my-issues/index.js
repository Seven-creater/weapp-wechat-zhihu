// pages/my-issues/index.js
const app = getApp();

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
    inflight: false,
    dirty: true,
    lastLoadedAt: 0
  },

  onLoad() {
    this.checkLoginAndLoad({ force: true });
  },

  onShow() {
    this.checkLoginAndLoad();
  },

  onPullDownRefresh() {
    this.setData({
      issuesPage: 1,
      postsPage: 1,
      issues: [],
      posts: [],
      issuesHasMore: true,
      postsHasMore: true,
      dirty: true,
      lastLoadedAt: 0
    });

    const promise = this.data.currentTab === "issues"
      ? this.loadMyIssues()
      : this.loadMyPosts();
    promise.finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.currentTab === "issues") {
      if (this.data.issuesHasMore && !this.data.loading) {
        this.loadMoreIssues();
      }
      return;
    }
    if (this.data.postsHasMore && !this.data.loading) {
      this.loadMorePosts();
    }
  },

  checkLoginAndLoad(options = {}) {
    const force = !!options.force;
    const now = Date.now();
    const expired = now - (this.data.lastLoadedAt || 0) > PAGE_TTL_MS;
    if (!force && (this.data.inflight || (!this.data.dirty && !expired))) {
      return Promise.resolve();
    }

    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!userInfo || !openid) {
      this.setData({ loading: false });
      wx.showModal({
        title: "未登录",
        content: "请先登录以查看您的发布记录",
        showCancel: false,
        confirmText: "去登录",
        success: (res) => {
          if (!res.confirm) return;
          app.login()
            .then(() => this.checkLoginAndLoad({ force: true }))
            .catch((err) => {
              console.error("登录失败:", err);
              this.setData({ loading: false });
            });
        }
      });
      return Promise.resolve();
    }

    app.globalData.userInfo = userInfo;
    app.globalData.openid = openid;
    this.setData({ inflight: true });

    const promise = this.data.currentTab === "issues"
      ? this.loadMyIssues()
      : this.loadMyPosts();

    return Promise.resolve(promise).then(() => {
      this.setData({
        dirty: false,
        lastLoadedAt: Date.now()
      });
    }).finally(() => {
      this.setData({ inflight: false });
    });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      loading: true,
      issuesPage: 1,
      postsPage: 1,
      dirty: true,
      lastLoadedAt: 0
    });

    if (tab === "issues") {
      this.setData({ issues: [], issuesHasMore: true });
      this.loadMyIssues();
      return;
    }
    this.setData({ posts: [], postsHasMore: true });
    this.loadMyPosts();
  },

  loadMyIssues() {
    const { issuesPage, limit } = this.data;

    return wx.cloud.callFunction({
      name: "getMyIssues",
      data: {
        type: "issues",
        page: issuesPage,
        pageSize: limit
      }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success) {
        throw new Error(payload.error || "query failed");
      }

      const newIssues = (payload.data || []).map((issue) => {
        const aiText = issue.aiAnalysis || issue.aiSolution || "";
        const aiSummary = aiText.length > 30
          ? aiText.substring(0, 30) + "..."
          : (aiText || "AI?????...");

        return {
          ...issue,
          createTime: this.formatTime(issue.createTime),
          aiSummary
        };
      });

      const issues = issuesPage === 1 ? newIssues : [...this.data.issues, ...newIssues];
      this.setData({
        issues,
        issuesHasMore: !!payload.hasMore,
        loading: false
      });
    }).catch((err) => {
      console.error("??????????:", err);
      this.setData({ issues: [], loading: false, issuesHasMore: false });
      wx.showToast({ title: "????", icon: "none" });
    });
  },

  loadMyPosts() {
    const { postsPage, limit } = this.data;

    return wx.cloud.callFunction({
      name: "getMyIssues",
      data: {
        type: "posts",
        page: postsPage,
        pageSize: limit
      }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success) {
        throw new Error(payload.error || "query failed");
      }

      const newPosts = (payload.data || []).map((post) => {
        const contentText = post.content || post.title || "";
        const summary = contentText.length > 30
          ? contentText.substring(0, 30) + "..."
          : (contentText || "???????");

        return {
          ...post,
          createTime: this.formatTime(post.createTime),
          stats: post.stats || { like: 0, comment: 0 },
          summary
        };
      });

      const posts = postsPage === 1 ? newPosts : [...this.data.posts, ...newPosts];
      this.setData({
        posts,
        postsHasMore: !!payload.hasMore,
        loading: false
      });
    }).catch((err) => {
      console.error("??????????:", err);
      this.setData({ posts: [], loading: false, postsHasMore: false });
      wx.showToast({ title: "????", icon: "none" });
    });
  },

  loadMoreIssues() {
    if (!this.data.issuesHasMore || this.data.loading) return;
    this.setData({ issuesPage: this.data.issuesPage + 1 });
    this.loadMyIssues();
  },

  loadMorePosts() {
    if (!this.data.postsHasMore || this.data.loading) return;
    this.setData({ postsPage: this.data.postsPage + 1 });
    this.loadMyPosts();
  },

  goToIssueDetail(e) {
    const issueId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/solution-detail/index?id=${issueId}&collection=issues`
    });
  },

  goToPostDetail(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) {
      wx.showToast({ title: "帖子ID无效", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${postId}`
    });
  },

  goToHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  formatTime(timestamp) {
    if (!timestamp) return "";

    let date;
    if (typeof timestamp === "object") {
      if (timestamp.$date) {
        date = new Date(timestamp.$date);
      } else if (timestamp.getTime) {
        date = timestamp;
      } else {
        return String(timestamp || "");
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
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `今天 ${hours}:${minutes}`;
    }
    if (diff < 48 * 60 * 60 * 1000) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `昨天 ${hours}:${minutes}`;
    }
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  onShareAppMessage() {
    return {
      title: "我的发布历史",
      path: "/pages/my-issues/index"
    };
  }
});
