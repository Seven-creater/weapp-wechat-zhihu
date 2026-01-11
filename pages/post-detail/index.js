const collectUtil = require("../../utils/collect.js");
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    post: null,
    comments: [],
    newComment: "",
    replyTo: null,
    loading: false,
    showCommentInput: false,
    isCollected: false, // 是否已收藏
    collectCount: 0, // 收藏数量
    // 动态输入相关状态
    placeholderText: "发表评论",
    isInputFocus: false,
    replyTarget: null,
  },

  onLoad: function (options) {
    const postId = options.id || options.postId;
    console.log("接收到的参数:", options);
    console.log("帖子ID:", postId);

    if (postId) {
      this.loadPostDetail(postId);
      this.loadComments(postId);
    } else {
      console.error("帖子ID为空", options);
      wx.showToast({
        title: "参数错误",
        icon: "none",
      });
    }
  },

  // 加载帖子详情
  loadPostDetail: function (postId) {
    this.setData({ loading: true });
    const openid = app.globalData.openid || wx.getStorageSync("openid");

    // 调用云函数获取详情（云函数会自动转换图片URL）
    wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "posts",
        docId: postId,
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          const post = res.result.data;

          if (post) {
            // 确保 userInfo 存在
            if (!post.userInfo) {
              post.userInfo = {
                nickName: "匿名用户",
                avatarUrl: "/images/default-avatar.png",
              };
            } else if (!post.userInfo.nickName) {
              post.userInfo.nickName = "匿名用户";
            }

            this.updatePostData(post, openid);
            this.initLikeStatus(postId, openid);
          } else {
            this.setData({ post: null, loading: false });
            wx.showToast({ title: "帖子不存在", icon: "none" });
          }
        } else {
          throw new Error(res.result?.error || "获取数据失败");
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("加载帖子详情失败:", err);
        this.setData({ loading: false });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      },
    });
  },

  // 更新帖子数据
  updatePostData: function (post, openid) {
    this.setData({
      post: {
        ...post,
        userInfo: post.userInfo || {
          nickName: "匿名用户",
          avatarUrl: "/images/default-avatar.png",
        },
        stats: post.stats || { view: 0, like: 0, comment: 0 },
        createTime: this.formatTime(post.createTime),
        isOwner: post._openid === openid,
      },
      loading: false,
    });

    // 初始化收藏状态
    collectUtil
      .initCollectStatus(this, "collect_post", post._id || post.postId)
      .catch(() => {
        // 初始化失败不影响主要功能
      });
  },

  // 初始化点赞状态
  initLikeStatus: function (postId, openid) {
    if (!openid) return;

    db.collection("actions")
      .where({
        type: "like_post",
        targetId: postId,
        _openid: openid,
      })
      .get()
      .then((likeRes) => {
        this.setData({
          post: {
            ...this.data.post,
            liked: likeRes.data.length > 0,
          },
        });
      })
      .catch(() => {});
  },

  // 加载评论列表
  loadComments: function (postId) {
    db.collection("comments")
      .where({ postId })
      .orderBy("createTime", "desc")
      .get()
      .then((res) => {
        const rawComments = res.data || [];
        const openid = app.globalData.openid || wx.getStorageSync("openid");
        const commentMap = new Map();
        const rootComments = [];

        rawComments.forEach((comment) => {
          const mapped = {
            ...comment,
            userInfo: comment.userInfo || {
              nickName: "匿名用户",
              avatarUrl: "/images/default-avatar.png",
            },
            createTime: this.formatTime(comment.createTime),
            likes: comment.likes || 0,
            liked: false,
            replies: [],
            isOwner: openid ? comment._openid === openid : false,
          };
          commentMap.set(comment._id, mapped);
        });

        rawComments.forEach((comment) => {
          const mapped = commentMap.get(comment._id);
          if (comment.parentId) {
            const parent = commentMap.get(comment.parentId);
            if (parent) {
              parent.replies.push(mapped);
            } else {
              rootComments.push(mapped);
            }
          } else {
            rootComments.push(mapped);
          }
        });

        this.setData({ comments: rootComments });
        this.initCommentLikeStatus(rawComments.map((item) => item._id));
      })
      .catch((err) => {
        console.error("加载评论失败:", err);
        this.setData({ comments: [] });
      });
  },

  initCommentLikeStatus: function (commentIds) {
    const openid = app.globalData.openid || wx.getStorageSync("openid");
    if (!openid || commentIds.length === 0) return;

    db.collection("actions")
      .where(
        _.or([
          { type: "like_comment", targetId: _.in(commentIds), _openid: openid },
          { type: "like_comment", postId: _.in(commentIds), _openid: openid },
        ])
      )
      .get()
      .then((res) => {
        const likedIds = new Set(
          res.data.map((item) => item.targetId || item.postId)
        );

        const comments = this.data.comments.map((comment) => {
          const replies = comment.replies
            ? comment.replies.map((reply) => ({
                ...reply,
                liked: likedIds.has(reply._id),
              }))
            : [];

          return {
            ...comment,
            liked: likedIds.has(comment._id),
            replies,
          };
        });

        this.setData({ comments });
      })
      .catch(() => {});
  },

  // 点赞帖子
  likePost: function () {
    const post = this.data.post;
    if (!post) return;

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
        const isLiked = !!post.liked;
        const currentLike = post.stats?.like || 0;
        const newLikeCount = isLiked
          ? Math.max(0, currentLike - 1)
          : currentLike + 1;

        const updatedPost = {
          ...post,
          liked: !isLiked,
          stats: {
            ...post.stats,
            like: newLikeCount,
          },
        };

        this.setData({ post: updatedPost });

        const openid = app.globalData.openid || wx.getStorageSync("openid");
        if (!openid) return;

        if (isLiked) {
          return db
            .collection("actions")
            .where({
              type: "like_post",
              targetId: post._id,
              _openid: openid,
            })
            .remove()
            .then(() => {
              return db
                .collection("posts")
                .doc(post._id)
                .update({
                  data: {
                    "stats.like": db.command.inc(-1),
                  },
                });
            })
            .catch((err) => {
              console.error("取消点赞失败:", err);
              this.setData({ post });
              wx.showToast({ title: "操作失败", icon: "none" });
            });
        }

        return db
          .collection("actions")
          .add({
            data: {
              type: "like_post",
              targetId: post._id,
              createTime: db.serverDate(),
            },
          })
          .then(() => {
            return db
              .collection("posts")
              .doc(post._id)
              .update({
                data: {
                  "stats.like": db.command.inc(1),
                },
              });
          })
          .catch((err) => {
            console.error("点赞失败:", err);
            this.setData({ post });
            wx.showToast({ title: "操作失败", icon: "none" });
          });
      })
      .catch(() => {});
  },

  // 显示评论输入框
  showCommentInput: function (e) {
    const replyTo = e.currentTarget.dataset.replyto;
    let placeholderText = "发表评论";
    let replyTarget = null;

    // 如果是回复评论，获取被回复用户的信息
    if (replyTo) {
      // 查找被回复的评论
      const comments = this.data.comments;
      let targetComment = null;

      // 先在主评论中查找
      targetComment = comments.find((c) => c._id === replyTo);

      // 如果没找到，在回复中查找
      if (!targetComment) {
        for (const comment of comments) {
          if (comment.replies) {
            targetComment = comment.replies.find((r) => r._id === replyTo);
            if (targetComment) break;
          }
        }
      }

      if (targetComment) {
        placeholderText = `回复 @${targetComment.userInfo.nickName}`;
        replyTarget = targetComment;
      }
    }

    this.setData({
      showCommentInput: true,
      replyTo: replyTo || null,
      placeholderText: placeholderText,
      replyTarget: replyTarget,
      isInputFocus: true,
    });
  },

  // 隐藏评论输入框
  hideCommentInput: function () {
    this.setData({
      showCommentInput: false,
      newComment: "",
      replyTo: null,
      placeholderText: "发表评论",
      isInputFocus: false,
      replyTarget: null,
    });
  },

  // 输入框失去焦点
  onInputBlur: function () {
    this.setData({ isInputFocus: false });
  },

  // 输入评论内容
  onCommentInput: function (e) {
    this.setData({
      newComment: e.detail.value,
    });
  },

  // 提交评论
  submitComment: async function () {
    const { newComment, replyTo, post } = this.data;

    if (!newComment.trim()) {
      wx.showToast({
        title: "请输入评论内容",
        icon: "none",
      });
      return;
    }

    if (!post) return;

    try {
      // 1. 开始 Loading
      wx.showLoading({ title: "正在审核...", mask: true });

      // --- 第一关：安全检测 ---
      const textCheckResult = await wx.cloud.callFunction({
        name: "checkContent",
        data: {
          type: "text",
          value: newComment,
        },
      });
      if (textCheckResult.result.code !== 0) {
        throw new Error(textCheckResult.result.msg || "评论包含敏感信息");
      }

      // --- 第二关：登录检查 ---
      await app.checkLogin().catch(() => {
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
      });

      // --- 第三关：写入数据库 ---
      const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");
      const commentData = {
        postId: post._id,
        parentId: replyTo || "",
        content: newComment.trim(),
        postTitle: post.content ? post.content.substring(0, 30) : "",
        userInfo: userInfo || {
          nickName: "匿名用户",
          avatarUrl: "/images/default-avatar.png",
        },
        createTime: db.serverDate(),
        likes: 0,
      };

      const addRes = await db.collection("comments").add({ data: commentData });
      const updateRes = await db
        .collection("posts")
        .doc(post._id)
        .update({
          data: {
            "stats.comment": db.command.inc(1),
          },
        });

      // ==========================================
      // ✅ 只有到了这里，才是真正的成功！
      // ==========================================

      wx.hideLoading();
      wx.showToast({
        title: "评论成功",
        icon: "success",
      });

      // 1. 创建评论对象
      const createdComment = {
        ...commentData,
        _id: addRes._id,
        createTime: this.formatTime(new Date()),
        liked: false,
        replies: [],
      };

      // 2. 更新评论列表 (UI 更新)
      const comments = [...this.data.comments];
      if (replyTo) {
        const parentIndex = comments.findIndex((c) => c._id === replyTo);
        if (parentIndex !== -1) {
          const parent = comments[parentIndex];
          const replies = parent.replies ? [...parent.replies] : [];
          replies.unshift(createdComment);
          comments[parentIndex] = {
            ...parent,
            replies,
          };
        } else {
          comments.unshift(createdComment);
        }
      } else {
        comments.unshift(createdComment);
      }

      // 3. 清空输入框并隐藏输入框 (UI 更新)
      this.setData({
        comments,
        newComment: "",
        showCommentInput: false,
        replyTo: null,
        post: {
          ...post,
          stats: {
            ...post.stats,
            comment: (post.stats?.comment || 0) + 1,
          },
        },
      });
    } catch (err) {
      // ❌ 失败处理
      wx.hideLoading();
      console.error("拦截成功或出错:", err);

      // 弹出红色警告，且**不清空输入框**（方便用户修改）
      wx.showModal({
        title: "发布失败",
        content: err.message || "内容包含敏感信息",
        showCancel: false,
        confirmText: "我知道了",
      });
    }
  },

  // 点赞评论
  likeComment: function (e) {
    const commentId = e.currentTarget.dataset.commentid;
    const isReply = e.currentTarget.dataset.isreply;
    const parentId = e.currentTarget.dataset.parentid;

    if (!commentId) return;

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
        const comments = [...this.data.comments];
        let comment = null;

        if (isReply && parentId) {
          const parentComment = comments.find((c) => c._id === parentId);
          if (parentComment && parentComment.replies) {
            comment = parentComment.replies.find((r) => r._id === commentId);
          }
        } else {
          comment = comments.find((c) => c._id === commentId);
        }

        if (!comment) return;

        const isLiked = !!comment.liked;
        const currentLikes = comment.likes || 0;
        const newLikes = isLiked
          ? Math.max(0, currentLikes - 1)
          : currentLikes + 1;

        comment.likes = newLikes;
        comment.liked = !isLiked;

        this.setData({ comments });

        const openid = app.globalData.openid || wx.getStorageSync("openid");
        if (!openid) return;

        if (isLiked) {
          return db
            .collection("actions")
            .where({
              type: "like_comment",
              targetId: commentId,
              _openid: openid,
            })
            .remove()
            .then(() => {
              return db
                .collection("comments")
                .doc(commentId)
                .update({
                  data: {
                    likes: db.command.inc(-1),
                  },
                });
            })
            .catch((err) => {
              console.error("取消评论点赞失败:", err);
              comment.likes = currentLikes;
              comment.liked = isLiked;
              this.setData({ comments });
              wx.showToast({ title: "操作失败", icon: "none" });
            });
        }

        return db
          .collection("actions")
          .add({
            data: {
              type: "like_comment",
              targetId: commentId,
              createTime: db.serverDate(),
            },
          })
          .then(() => {
            return db
              .collection("comments")
              .doc(commentId)
              .update({
                data: {
                  likes: db.command.inc(1),
                },
              });
          })
          .catch((err) => {
            console.error("评论点赞失败:", err);
            comment.likes = currentLikes;
            comment.liked = isLiked;
            this.setData({ comments });
            wx.showToast({ title: "操作失败", icon: "none" });
          });
      })
      .catch(() => {});
  },

  // 删除帖子
  deletePost: function (e) {
    const postId = e.currentTarget.dataset.postid;
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

            wx.showToast({ title: "已删除", icon: "success" });
            wx.navigateBack();
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

  // 删除评论/回复
  deleteComment: function (e) {
    const commentId = e.currentTarget.dataset.commentid;
    const postId = this.data.post?._id;
    if (!commentId || !postId) return;

    wx.showModal({
      title: "确认删除",
      content: "删除后该评论及回复将被清理，是否继续？",
      confirmText: "删除",
      confirmColor: "#ff4d4f",
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: "删除中...", mask: true });

        wx.cloud
          .callFunction({
            name: "deleteComment",
            data: { commentId, postId },
          })
          .then((result) => {
            const success = result && result.result && result.result.success;
            if (!success) {
              throw new Error(
                (result && result.result && result.result.error) || "删除失败"
              );
            }

            const removedCount = result.result.removed || 1;

            this.loadComments(postId);

            this.setData({
              post: {
                ...this.data.post,
                stats: {
                  ...this.data.post.stats,
                  comment: Math.max(
                    0,
                    (this.data.post.stats?.comment || 0) - removedCount
                  ),
                },
              },
            });

            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((err) => {
            console.error("删除评论失败:", err);
            wx.showToast({ title: "删除失败", icon: "none" });
          })
          .finally(() => {
            wx.hideLoading();
          });
      },
    });
  },

  // 分享帖子
  sharePost: function () {
    wx.showShareMenu({
      withShareTicket: true,
    });

    wx.showToast({
      title: "分享功能已开启",
      icon: "success",
    });
  },

  // 预览图片
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

  onShareAppMessage: function () {
    const { post } = this.data;
    return {
      title: post ? post.content.substring(0, 20) + "..." : "无障碍社区分享",
      path: "/pages/post-detail/index?postId=" + (post ? post._id : ""),
    };
  },

  // 收藏/取消收藏帖子
  toggleCollect: function () {
    const postId = this.data.post?._id;
    if (!postId) return;

    const targetData = {
      title: this.data.post.content?.substring(0, 30) || "未命名帖子",
      image: this.data.post.images?.[0] || "",
    };

    collectUtil
      .toggleCollect(this, "collect_post", postId, targetData)
      .then(() => {
        // 收藏操作成功，不需要额外提示
      })
      .catch((err) => {
        console.error("收藏操作失败:", err);
        // 操作失败时回滚UI状态
        this.setData({
          isCollected: !this.data.isCollected,
          collectCount: this.data.isCollected
            ? this.data.collectCount - 1
            : this.data.collectCount + 1,
        });
        wx.showToast({
          title: "操作失败，请重试",
          icon: "none",
        });
      });
  },

  // 页面卸载时，将最新的收藏状态更新回列表页
  onUnload: function () {
    const pages = getCurrentPages();
    if (pages.length < 2) return;

    const prevPage = pages[pages.length - 2];
    const postId = this.data.post?._id;

    if (!postId) return;

    // 检查上一页是否是列表页，并调用更新方法
    if (
      prevPage.route === "pages/community/community" &&
      prevPage.updatePostStatus
    ) {
      prevPage.updatePostStatus(postId, {
        isCollected: this.data.isCollected,
        collectCount: this.data.collectCount,
      });
    }
  },
});
