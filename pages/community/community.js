const collectUtil = require("../../utils/collect.js");
const app = getApp();

Page({
  data: {
    posts: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    searchVal: "",
    isSearchMode: false,
  },

  onLoad: function () {
    this.loadData(true);
  },

  onShow: function () {
    this.loadData(true);
  },

  onPullDownRefresh: function () {
    this.loadData(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loading || this.data.isSearchMode) {
      return;
    }
    this.loadData(false);
  },

  loadData: function (reset = false) {
    if (this.data.loading) return Promise.resolve();

    if (reset) {
      this.setData({
        page: 1,
        hasMore: true,
        isSearchMode: false,
      });
    }

    this.setData({ loading: true });

    const { page, pageSize } = this.data;

    return wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "posts",
        page: page,
        pageSize: pageSize,
        orderBy: "createTime",
        order: "desc",
      },
      success: (res) => {
        if (res.result && res.result.success) {
          let newPosts = res.result.data.map((post) => ({
            ...post,
            createTime: this.formatTime(post.createTime),
          }));

          const allPosts = reset ? newPosts : [...this.data.posts, ...newPosts];

          const isEnd = newPosts.length < pageSize;

          this.attachActionStatus(allPosts).then((mergedPosts) => {
            this.setData({
              posts: mergedPosts,
              loading: false,
              hasMore: !isEnd,
            });
          });

          console.log(
            `加载${reset ? "首页" : "更多"}: ${newPosts.length}条, ` +
              `累计: ${allPosts.length}, ` +
              `还有更多: ${!isEnd}`
          );
        } else {
          throw new Error(res.result?.error || "获取数据失败");
        }
      },
      fail: (err) => {
        console.error("调用云函数失败:", err);
        this.setData({
          loading: false,
        });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      },
    });
  },

  attachActionStatus: function (posts) {
    const ids = posts.map((item) => item._id).filter(Boolean);
    if (ids.length === 0) {
      return Promise.resolve(posts);
    }

    const db = wx.cloud.database();
    const _ = db.command;
    const openid = app.globalData.openid;

    return Promise.all([
      db
        .collection("actions")
        .where(
          _.or([
            { type: "collect_post", targetId: _.in(ids) },
            { type: "collect_post", postId: _.in(ids) },
          ])
        )
        .get(),
      openid
        ? db
            .collection("actions")
            .where(
              _.or([
                { type: "like_post", targetId: _.in(ids), _openid: openid },
                { type: "like_post", postId: _.in(ids), _openid: openid },
              ])
            )
            .get()
        : Promise.resolve({ data: [] }),
    ]).then(([collectRes, likeRes]) => {
      const collectedIds = new Set(
        collectRes.data.map((item) => item.targetId || item.postId)
      );
      const likedIds = new Set(
        likeRes.data.map((item) => item.targetId || item.postId)
      );

      return posts.map((item) => ({
        ...item,
        isCollected: collectedIds.has(item._id),
        collectCount: item.collectCount || 0,
        liked: likedIds.has(item._id),
      }));
    });
  },

  // 搜索输入处理
  onSearchInput: function (e) {
    this.setData({
      searchVal: e.detail.value,
    });
  },

  // 触发搜索
  onSearch: function () {
    const keyword = this.data.searchVal.trim();

    if (keyword) {
      this.keywordSearch(keyword);
    } else {
      this.setData({
        page: 1,
        hasMore: true,
        isSearchMode: false,
      });
      this.loadData(true);
    }
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({
      searchVal: "",
      page: 1,
      hasMore: true,
      isSearchMode: false,
    });
    this.loadData(true);
  },

  // 关键词搜索（调用云函数）
  keywordSearch: function (keyword) {
    if (!keyword.trim()) return;

    wx.showLoading({
      title: "搜索中...",
      mask: true,
    });

    this.setData({ isSearchMode: true });

    wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "posts",
        keyword: keyword,
        page: 1,
        pageSize: 50,
        orderBy: "createTime",
        order: "desc",
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          const newPosts = res.result.data.map((post) => ({
            ...post,
            createTime: this.formatTime(post.createTime),
          }));

          this.setData({
            posts: newPosts,
            hasMore: false,
            loading: false,
            page: 1,
          });

          this.attachActionStatus(newPosts);

          if (newPosts.length === 0) {
            wx.showToast({
              title: "暂无相关内容",
              icon: "none",
            });
          }

          console.log("搜索完成，找到", newPosts.length, "条结果");
        } else {
          wx.showToast({
            title: res.result?.error || "搜索失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("搜索失败:", err);
        this.setData({ isSearchMode: false });
        wx.showToast({
          title: "搜索失败，请重试",
          icon: "none",
        });
      },
    });
  },

  // 跳转到帖子详情
  goToDetail: function (e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: "/pages/post-detail/index?postId=" + postId,
    });
  },

  // 点赞帖子
  likePost: function (e) {
    const postId = e.currentTarget.dataset.postid;
    const index = e.currentTarget.dataset.index;

    if (!postId) return;

    app
      .checkLogin()
      .catch(() => {
        return new Promise((resolve, reject) => {
          wx.showModal({
            title: "提示",
            content: "请先登录",
            confirmText: "去登录",
            cancelText: "取消",
            success: (res) => {
              if (res.confirm) {
                app
                  .login()
                  .then(() => resolve())
                  .catch((err) => reject(err));
              } else {
                reject(new Error("未登录"));
              }
            },
          });
        });
      })
      .then(() => {
        const posts = [...this.data.posts];
        const post = posts[index];
        if (!post) return;

        const isLiked = !!post.liked;
        const currentLike = post.stats?.like || 0;
        const newLikeCount = isLiked
          ? Math.max(0, currentLike - 1)
          : currentLike + 1;

        posts[index] = {
          ...post,
          liked: !isLiked,
          stats: {
            ...post.stats,
            like: newLikeCount,
          },
        };

        this.setData({ posts });

        const db = wx.cloud.database();
        const openid = app.globalData.openid;

        if (!openid) return;

        if (isLiked) {
          return db
            .collection("actions")
            .where({
              type: "like_post",
              targetId: postId,
              _openid: openid,
            })
            .remove()
            .then(() => {
              return db
                .collection("posts")
                .doc(postId)
                .update({
                  data: {
                    "stats.like": db.command.inc(-1),
                  },
                });
            })
            .catch((err) => {
              console.error("取消点赞失败:", err);
              posts[index] = post;
              this.setData({ posts });
              wx.showToast({ title: "操作失败", icon: "none" });
            });
        }

        return db
          .collection("actions")
          .add({
            data: {
              type: "like_post",
              targetId: postId,
              createTime: db.serverDate(),
            },
          })
          .then(() => {
            return db
              .collection("posts")
              .doc(postId)
              .update({
                data: {
                  "stats.like": db.command.inc(1),
                },
              });
          })
          .catch((err) => {
            console.error("点赞失败:", err);
            posts[index] = post;
            this.setData({ posts });
            wx.showToast({ title: "操作失败", icon: "none" });
          });
      })
      .catch(() => {});
  },

  // 跳转到发布页面
  goToCreatePost: function () {
    wx.navigateTo({
      url: "/pages/post/create",
    });
  },

  // 更新帖子收藏状态（从详情页回传）
  updatePostStatus: function (postId, status) {
    const posts = this.data.posts;
    const postIndex = posts.findIndex((item) => item._id === postId);

    if (postIndex !== -1) {
      // 更新对应帖子的收藏状态
      const updatedPosts = [...posts];
      updatedPosts[postIndex] = {
        ...updatedPosts[postIndex],
        isCollected: status.isCollected,
        collectCount: status.collectCount,
      };

      this.setData({
        posts: updatedPosts,
      });
    }
  },

  // 收藏帖子（列表页直接操作）
  collectPost: function (e) {
    const postId = e.currentTarget.dataset.postid;
    const index = e.currentTarget.dataset.index;
    const posts = this.data.posts;

    if (index >= 0 && index < posts.length) {
      const post = posts[index];
      const newIsCollected = !post.isCollected;
      const newCollectCount = newIsCollected
        ? (post.collectCount || 0) + 1
        : Math.max(0, (post.collectCount || 0) - 1);

      // 乐观更新UI
      const updatedPosts = [...posts];
      updatedPosts[index] = {
        ...updatedPosts[index],
        isCollected: newIsCollected,
        collectCount: newCollectCount,
      };

      this.setData({
        posts: updatedPosts,
      });

      const targetData = {
        title: post.content?.substring(0, 30) || "未命名帖子",
        image: post.images?.[0] || "",
      };

      collectUtil
        .toggleCollect(this, "collect_post", postId, targetData)
        .catch((err) => {
          console.error("收藏操作失败:", err);
          const rollbackPosts = [...this.data.posts];
          rollbackPosts[index] = {
            ...rollbackPosts[index],
            isCollected: !newIsCollected,
            collectCount: newIsCollected
              ? Math.max(0, newCollectCount - 1)
              : newCollectCount + 1,
          };
          this.setData({ posts: rollbackPosts });
          wx.showToast({ title: "操作失败，请重试", icon: "none" });
        });
    }
  },

  deletePost: function (e) {
    const postId = e.currentTarget.dataset.postid;
    const index = e.currentTarget.dataset.index;

    if (!postId) return;

    wx.showModal({
      title: "确认删除",
      content: "删除后评论和点赞会一并清理，是否继续？",
      confirmText: "删除",
      confirmColor: "#ff4d4f",
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: "删除中...", mask: true });

        wx.cloud
          .callFunction({
            name: "deletePost",
            data: { postId },
          })
          .then((result) => {
            const success = result && result.result && result.result.success;
            if (!success) {
              throw new Error(
                (result && result.result && result.result.error) || "删除失败"
              );
            }

            const posts = [...this.data.posts];
            if (index >= 0) {
              posts.splice(index, 1);
            } else {
              const next = posts.filter((item) => item._id !== postId);
              posts.splice(0, posts.length, ...next);
            }
            this.setData({ posts });
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((err) => {
            console.error("删除帖子失败:", err);
            wx.showToast({ title: "删除失败", icon: "none" });
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },

  sharePost: function () {
    wx.showShareMenu({
      withShareTicket: true,
    });
  },

  previewImage: function (e) {
    const current = e.currentTarget.dataset.current;
    const urls = e.currentTarget.dataset.urls;

    if (current && urls && urls.length > 0) {
      wx.previewImage({
        current: current,
        urls: urls,
      });
    }
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
});
