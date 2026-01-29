// pages/notify/notify.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentTab: 0,
    messages: [], // Chat conversations
    notifications: [], // System/Like notifications
    noticeItems: [],
    loading: false,
    messagePage: 1,
    messagePageSize: 20,
    messageHasMore: true,
    messageLoading: false,
    noticeLoading: false,
  },

  onShow: function () {
    this.checkLoginAndLoad();
  },

  checkLoginAndLoad: function () {
    app
      .checkLogin()
      .then(() => {
        this.loadConversations(true);
        this.loadNotifications(true);
      })
      .catch(() => {
        this.setData({
          messages: [],
          noticeItems: this.buildDefaultNoticeItems("登录后查看最新通知"),
          messageHasMore: false,
          messageLoading: false,
          noticeLoading: false,
        });
      });
  },

  onTabTap: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index });
  },

  loadConversations: function (refresh) {
    if (this.data.messageLoading) return;
    if (!this.data.messageHasMore && !refresh) return;

    const myOpenId = app.globalData.openid || wx.getStorageSync("openid");
    if (!myOpenId) {
      this.setData({
        messages: [],
        messageHasMore: false,
        messageLoading: false,
      });
      return;
    }

    const nextPage = refresh ? 1 : this.data.messagePage + 1;
    this.setData({ messageLoading: true });

    db.collection("conversations")
      .where({
        ownerId: myOpenId,
      })
      .orderBy("updateTime", "desc")
      .skip((nextPage - 1) * this.data.messagePageSize)
      .limit(this.data.messagePageSize)
      .get()
      .then((res) => {
        const mapped = (res.data || []).map((item) => ({
          id: item.targetId,
          name:
            (item.targetUserInfo && item.targetUserInfo.nickName) || "未知用户",
          avatar:
            (item.targetUserInfo && item.targetUserInfo.avatarUrl) ||
            "/images/zhi.png",
          time: this.formatTime(item.updateTime),
          preview: item.lastMessage || "暂无消息",
          unread: item.unread || 0,
        }));
        const messages = refresh
          ? mapped
          : (this.data.messages || []).concat(mapped);
        const hasMore = mapped.length >= this.data.messagePageSize;
        this.setData({
          messages,
          messagePage: nextPage,
          messageHasMore: hasMore,
          messageLoading: false,
        });
      })
      .catch((err) => {
        console.error("加载私信失败", err);
        this.setData({ messages: [], messageLoading: false });
      });
  },

  loadNotifications: function (refresh) {
    if (this.data.noticeLoading) return;
    this.setData({ noticeLoading: true });

    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid) {
      this.setData({
        noticeItems: this.buildDefaultNoticeItems("登录后查看最新通知"),
        noticeLoading: false,
      });
      return;
    }

    this.fetchMyPostIds(openid)
      .then((postIds) => this.buildNoticeItems(openid, postIds || []))
      .then((items) => {
        this.setData({
          noticeItems: items,
          noticeLoading: false,
        });
      })
      .catch(() => {
        this.setData({
          noticeItems: this.buildDefaultNoticeItems("暂无通知"),
          noticeLoading: false,
        });
      });
  },

  fetchMyPostIds: function (openid) {
    return db
      .collection("posts")
      .where({ _openid: openid })
      .field({ _id: true })
      .limit(100)
      .get()
      .then((res) => (res.data || []).map((item) => item._id).filter(Boolean));
  },

  formatTime: function (date) {
    if (!date) return "";
    const d = this.normalizeDate(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  normalizeDate: function (value) {
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      return new Date(value);
    }
    if (value.toDate) return value.toDate();
    return new Date(0);
  },

  getLastRead: function (key) {
    const stored = wx.getStorageSync("notifyLastRead") || {};
    return stored[key] || 0;
  },

  setLastRead: function (key) {
    const stored = wx.getStorageSync("notifyLastRead") || {};
    stored[key] = Date.now();
    wx.setStorageSync("notifyLastRead", stored);
  },

  buildDefaultNoticeItems: function (placeholder) {
    return [
      {
        key: "like",
        title: "赞和收藏",
        preview: placeholder,
        time: "",
        unread: 0,
        icon: "/images/heart2.png",
        className: "like-avatar",
      },
      {
        key: "comment",
        title: "评论和@",
        preview: placeholder,
        time: "",
        unread: 0,
        icon: "/images/comment.png",
        className: "comment-avatar",
      },
      {
        key: "follow",
        title: "新增关注",
        preview: placeholder,
        time: "",
        unread: 0,
        icon: "/images/add-user.png",
        className: "follow-avatar",
      },
      {
        key: "system",
        title: "系统通知",
        preview: placeholder,
        time: "",
        unread: 0,
        icon: "/images/ring.png",
        className: "system-avatar",
      },
    ];
  },

  buildNoticeItems: function (openid, postIds) {
    const ids = postIds.slice(0, 100);
    const likeTypes = ["like_post", "collect_post", "like", "collect"];

    const likeQuery = ids.length
      ? db
          .collection("actions")
          .where(
            _.and([
              { type: _.in(likeTypes) },
              _.or([{ targetId: _.in(ids) }, { postId: _.in(ids) }]),
            ]),
          )
      : null;

    const commentQuery = ids.length
      ? db.collection("comments").where({ postId: _.in(ids) })
      : null;

    const followQuery = db.collection("follows").where({ targetId: openid });

    const likeCountPromise = likeQuery
      ? likeQuery.count()
      : Promise.resolve({ total: 0 });
    const likeLatestPromise = likeQuery
      ? likeQuery.orderBy("createTime", "desc").limit(1).get()
      : Promise.resolve({ data: [] });
    const likeUnreadPromise = likeQuery
      ? db
          .collection("actions")
          .where(
            _.and([
              { type: _.in(likeTypes) },
              _.or([{ targetId: _.in(ids) }, { postId: _.in(ids) }]),
              { createTime: _.gt(new Date(this.getLastRead("like"))) },
            ]),
          )
          .count()
      : Promise.resolve({ total: 0 });

    const commentCountPromise = commentQuery
      ? commentQuery.count()
      : Promise.resolve({ total: 0 });
    const commentLatestPromise = commentQuery
      ? commentQuery.orderBy("createTime", "desc").limit(1).get()
      : Promise.resolve({ data: [] });
    const commentUnreadPromise = commentQuery
      ? db
          .collection("comments")
          .where(
            _.and([
              { postId: _.in(ids) },
              { createTime: _.gt(new Date(this.getLastRead("comment"))) },
            ]),
          )
          .count()
      : Promise.resolve({ total: 0 });

    const followCountPromise = followQuery.count();
    const followLatestPromise = followQuery
      .orderBy("createTime", "desc")
      .limit(1)
      .get();
    const followUnreadPromise = db
      .collection("follows")
      .where(
        _.and([
          { targetId: openid },
          { createTime: _.gt(new Date(this.getLastRead("follow"))) },
        ]),
      )
      .count();

    return Promise.all([
      likeCountPromise,
      likeLatestPromise,
      likeUnreadPromise,
      commentCountPromise,
      commentLatestPromise,
      commentUnreadPromise,
      followCountPromise,
      followLatestPromise,
      followUnreadPromise,
    ]).then(async (results) => {
      const [
        likeCountRes,
        likeLatestRes,
        likeUnreadRes,
        commentCountRes,
        commentLatestRes,
        commentUnreadRes,
        followCountRes,
        followLatestRes,
        followUnreadRes,
      ] = results;

      const likeLatest = (likeLatestRes.data || [])[0];
      const commentLatest = (commentLatestRes.data || [])[0];
      const followLatest = (followLatestRes.data || [])[0];

      const [likeUser, followUser] = await Promise.all([
        likeLatest
          ? this.getUserInfoByOpenid(likeLatest._openid)
          : Promise.resolve(null),
        followLatest
          ? this.getUserInfoByOpenid(followLatest.followerId)
          : Promise.resolve(null),
      ]);

      const likePreview =
        likeCountRes.total > 0
          ? `${(likeUser && likeUser.nickName) || "有人"} 赞了你的内容`
          : "暂无新动态";
      const commentPreview =
        commentCountRes.total > 0
          ? `${(commentLatest && commentLatest.userInfo && commentLatest.userInfo.nickName) || "有人"} 评论了你的帖子`
          : "暂无新评论";
      const followPreview =
        followCountRes.total > 0
          ? `${(followUser && followUser.nickName) || "有人"} 关注了你`
          : "暂无新关注";

      return [
        {
          key: "like",
          title: "赞和收藏",
          preview: likePreview,
          time: likeLatest ? this.formatTime(likeLatest.createTime) : "",
          unread: likeUnreadRes.total || 0,
          icon: "/images/heart2.png",
          className: "like-avatar",
        },
        {
          key: "comment",
          title: "评论和@",
          preview: commentPreview,
          time: commentLatest ? this.formatTime(commentLatest.createTime) : "",
          unread: commentUnreadRes.total || 0,
          icon: "/images/comment.png",
          className: "comment-avatar",
        },
        {
          key: "follow",
          title: "新增关注",
          preview: followPreview,
          time: followLatest ? this.formatTime(followLatest.createTime) : "",
          unread: followUnreadRes.total || 0,
          icon: "/images/add-user.png",
          className: "follow-avatar",
        },
        {
          key: "system",
          title: "系统通知",
          preview: "暂无系统通知",
          time: "",
          unread: 0,
          icon: "/images/ring.png",
          className: "system-avatar",
        },
      ];
    });
  },

  getUserInfoByOpenid: function (openid) {
    if (!openid) return Promise.resolve(null);
    return db
      .collection("users")
      .where({ _openid: openid })
      .limit(1)
      .get()
      .then((res) => {
        const doc = res.data && res.data[0];
        if (!doc) return null;
        return {
          nickName:
            doc.nickName ||
            (doc.userInfo && doc.userInfo.nickName) ||
            "匿名用户",
          avatarUrl:
            doc.avatarUrl ||
            (doc.userInfo && doc.userInfo.avatarUrl) ||
            "/images/zhi.png",
          _openid: doc._openid,
        };
      })
      .catch(() => null);
  },

  onSystemMsgTap: function () {
    this.setLastRead("system");
    wx.showToast({ title: "系统通知详情", icon: "none" });
  },

  onLikeMsgTap: function () {
    this.setLastRead("like");
    wx.showActionSheet({
      itemList: ["查看赞过", "查看我的收藏"],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({
            url: "/pages/mine/index?tab=2",
          });
          return;
        }
        if (res.tapIndex === 1) {
          wx.navigateTo({
            url: "/pages/my-favorites/index",
          });
        }
      },
      fail: () => {
        // 默认跳转到收藏
        wx.navigateTo({
          url: "/pages/my-favorites/index",
        });
      },
    });
  },

  onCommentMsgTap: function () {
    this.setLastRead("comment");
    wx.navigateTo({
      url: "/pages/my-comments/index",
    });
  },

  onFollowMsgTap: function () {
    this.setLastRead("follow");
    wx.navigateTo({
      url: "/pages/follow-list/index?type=followers",
    });
  },

  onNoticeTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (key === "like") {
      this.onLikeMsgTap();
      return;
    }
    if (key === "comment") {
      this.onCommentMsgTap();
      return;
    }
    if (key === "follow") {
      this.onFollowMsgTap();
      return;
    }
    this.onSystemMsgTap();
  },

  onChatTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const messages = (this.data.messages || []).map((item) =>
      item.id === id ? { ...item, unread: 0 } : item,
    );
    this.setData({ messages });
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}`,
    });
  },

  onPullDownRefresh: function () {
    const currentTab = this.data.currentTab;
    const promise =
      currentTab === 0
        ? Promise.resolve(this.loadNotifications(true))
        : Promise.resolve(this.loadConversations(true));
    promise.finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.currentTab === 1) {
      this.loadConversations(false);
    }
  },
});
