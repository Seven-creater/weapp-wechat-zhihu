// pages/notify/notify.js
const app = getApp();

const PAGE_TTL_MS = 30 * 1000;

Page({
  data: {
    currentTab: 0,
    messages: [],
    noticeItems: [],
    messagePage: 1,
    messagePageSize: 20,
    messageHasMore: true,
    messageLoading: false,
    noticeLoading: false,
    pageInflight: false,
    dirty: true,
    lastLoadedAt: 0
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.checkLoginAndLoad();
  },

  checkLoginAndLoad(options = {}) {
    const force = !!options.force;
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");

    if (!openid || !userInfo) {
      this.setData({
        messages: [],
        noticeItems: this.buildDefaultNoticeItems("登录后查看最新通知"),
        messageHasMore: false,
        messageLoading: false,
        noticeLoading: false
      });
      this.showLoginPrompt();
      return Promise.resolve();
    }

    const now = Date.now();
    const expired = now - (this.data.lastLoadedAt || 0) > PAGE_TTL_MS;
    if (!force && (this.data.pageInflight || (!this.data.dirty && !expired))) {
      this.updateUnreadBadge();
      return Promise.resolve();
    }

    this.setData({ pageInflight: true, dirty: false });
    return Promise.all([
      Promise.resolve(this.loadConversations(true)),
      Promise.resolve(this.loadNotifications(true))
    ]).finally(() => {
      this.setData({
        pageInflight: false,
        lastLoadedAt: Date.now()
      });
      this.updateUnreadBadge();
    });
  },

  showLoginPrompt() {
    wx.showModal({
      title: "需要登录",
      content: "查看消息前需要先登录，是否前往登录？",
      confirmText: "去登录",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: "/pages/login/index" });
        }
      }
    });
  },

  onTabTap(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    if (index === this.data.currentTab) return;
    this.setData({ currentTab: index });
  },

  fetchUsersBatch(openids) {
    const ids = Array.from(new Set((openids || []).filter(Boolean)));
    if (ids.length === 0) return Promise.resolve({});

    return wx.cloud.callFunction({
      name: "getUsersBatch",
      data: {
        openids: ids,
        fieldMode: "basic"
      }
    }).then((res) => {
      if (res.result && res.result.success && res.result.data) {
        return res.result.data;
      }
      return {};
    }).catch((err) => {
      console.error("getUsersBatch failed:", err);
      return {};
    });
  },

  loadConversations(refresh) {
    if (this.data.messageLoading) return Promise.resolve();
    if (!this.data.messageHasMore && !refresh) return Promise.resolve();

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid) {
      this.setData({
        messages: [],
        messageHasMore: false,
        messageLoading: false
      });
      return Promise.resolve();
    }

    const nextPage = refresh ? 1 : this.data.messagePage + 1;
    this.setData({ messageLoading: true });

    return wx.cloud.callFunction({
      name: "getConversationList",
      data: {
        page: nextPage,
        pageSize: this.data.messagePageSize
      }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success) {
        throw new Error(payload.error || "load failed");
      }

      const mapped = (payload.data || []).map((item) => ({
        id: item.id,
        name: item.name || "????",
        avatar: item.avatar || "/images/zhi.png",
        userType: item.userType || "normal",
        time: this.formatTime(item.updateTime),
        preview: item.preview || "????",
        unread: item.unread || 0
      }));

      const messages = refresh ? mapped : (this.data.messages || []).concat(mapped);
      this.setData({
        messages,
        messagePage: nextPage,
        messageHasMore: !!payload.hasMore,
        messageLoading: false
      });
    }).catch((err) => {
      console.error("??????", err);
      this.setData({ messages: [], messageLoading: false });
    });
  },

  loadNotifications() {
    if (this.data.noticeLoading) return Promise.resolve();
    this.setData({ noticeLoading: true });

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid) {
      this.setData({
        noticeItems: this.buildDefaultNoticeItems("登录后查看最新通知"),
        noticeLoading: false
      });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: "getNotificationSummary",
      data: {
        pageSize: 20,
        lastRead: {
          like: this.getLastRead("like"),
          comment: this.getLastRead("comment"),
          follow: this.getLastRead("follow")
        }
      }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "load summary failed");
      }

      const summary = payload.data;
      const like = summary.like || {};
      const comment = summary.comment || {};
      const follow = summary.follow || {};
      const system = summary.system || {};

      const likeName = like.latest && like.latest.actorName ? like.latest.actorName : "有人";
      const commentName = comment.latest && comment.latest.actorName ? comment.latest.actorName : "有人";
      const followName = follow.latest && follow.latest.actorName ? follow.latest.actorName : "有人";

      this.setData({
        noticeItems: [
          {
            key: "like",
            title: "赞和收藏",
            preview: like.total > 0 ? `${likeName} 赞了你的内容` : "暂无新动态",
            time: like.latest ? this.formatTime(like.latest.createTime) : "",
            unread: like.unread || 0,
            icon: "/images/heart2.png",
            className: "like-avatar"
          },
          {
            key: "comment",
            title: "评论",
            preview: comment.total > 0 ? `${commentName} 评论了你的帖子` : "暂无新评论",
            time: comment.latest ? this.formatTime(comment.latest.createTime) : "",
            unread: comment.unread || 0,
            icon: "/images/comment.png",
            className: "comment-avatar"
          },
          {
            key: "follow",
            title: "新增关注",
            preview: follow.total > 0 ? `${followName} 关注了你` : "暂无新关注",
            time: follow.latest ? this.formatTime(follow.latest.createTime) : "",
            unread: follow.unread || 0,
            icon: "/images/add-user.png",
            className: "follow-avatar"
          },
          {
            key: "system",
            title: "系统通知",
            preview: system.preview || "暂无系统通知",
            time: system.latest ? this.formatTime(system.latest.createTime) : "",
            unread: system.unread || 0,
            icon: "/images/ring.png",
            className: "system-avatar"
          }
        ],
        noticeLoading: false
      });
    }).catch((err) => {
      console.error("load notification summary failed:", err);
      this.setData({
        noticeItems: this.buildDefaultNoticeItems("暂无通知"),
        noticeLoading: false
      });
    });
  },

  buildDefaultNoticeItems(placeholder) {
    return [
      { key: "like", title: "赞和收藏", preview: placeholder, time: "", unread: 0, icon: "/images/heart2.png", className: "like-avatar" },
      { key: "comment", title: "评论", preview: placeholder, time: "", unread: 0, icon: "/images/comment.png", className: "comment-avatar" },
      { key: "follow", title: "新增关注", preview: placeholder, time: "", unread: 0, icon: "/images/add-user.png", className: "follow-avatar" },
      { key: "system", title: "系统通知", preview: placeholder, time: "", unread: 0, icon: "/images/ring.png", className: "system-avatar" }
    ];
  },

  getLastRead(key) {
    const stored = wx.getStorageSync("notifyLastRead") || {};
    return stored[key] || 0;
  },

  setLastRead(key) {
    const stored = wx.getStorageSync("notifyLastRead") || {};
    stored[key] = Date.now();
    wx.setStorageSync("notifyLastRead", stored);
    this.setData({ dirty: true });
  },

  normalizeDate(value) {
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") return new Date(value);
    if (value.toDate) return value.toDate();
    return new Date(0);
  },

  formatTime(date) {
    if (!date) return "";
    const d = this.normalizeDate(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  onSystemMsgTap() {
    this.setLastRead("system");
    wx.showToast({ title: "系统通知详情", icon: "none" });
  },

  onLikeMsgTap() {
    this.setLastRead("like");
    wx.navigateTo({ url: "/pages/like-notifications/index" });
  },

  onCommentMsgTap() {
    this.setLastRead("comment");
    wx.navigateTo({ url: "/pages/comment-notifications/index" });
  },

  onFollowMsgTap() {
    this.setLastRead("follow");
    wx.navigateTo({ url: "/pages/follow-list/index?type=followers" });
  },

  onNoticeTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "like") return this.onLikeMsgTap();
    if (key === "comment") return this.onCommentMsgTap();
    if (key === "follow") return this.onFollowMsgTap();
    return this.onSystemMsgTap();
  },

  onChatTap(e) {
    const id = e.currentTarget.dataset.id;
    const messages = (this.data.messages || []).map((item) =>
      item.id === id ? { ...item, unread: 0 } : item
    );
    this.setData({ messages });
    this.updateUnreadBadge();
    app.updateUnreadCount({ force: true, source: "notify_chat_tap" });

    wx.navigateTo({ url: `/pages/chat/chat?id=${id}` });
  },

  updateUnreadBadge() {
    const totalUnread = app && typeof app.getUnreadCount === "function"
      ? app.getUnreadCount()
      : 0;
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().updateUnreadCount(totalUnread);
    }
  },

  onPullDownRefresh() {
    const currentTab = this.data.currentTab;
    const promise = currentTab === 0
      ? Promise.resolve(this.loadNotifications(true))
      : Promise.resolve(this.loadConversations(true));
    promise.finally(() => {
      this.setData({ dirty: true, lastLoadedAt: 0 });
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.currentTab === 1) {
      this.loadConversations(false);
    }
  }
});
