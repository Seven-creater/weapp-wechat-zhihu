const collectUtil = require("../../utils/collect.js");

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
  },

  onLoad: function (options) {
    const postId = options.postId;
    this.loadPostDetail(postId);
    this.loadComments(postId);
  },

  // 加载帖子详情
  loadPostDetail: function (postId) {
    this.setData({ loading: true });

    // 模拟从数据库加载帖子详情
    const mockPost = this.getMockPost(postId);

    setTimeout(() => {
      this.setData({
        post: mockPost,
        loading: false,
      });

      // 初始化收藏状态
      collectUtil.initCollectStatus(this, "collect_post", postId).catch(() => {
        // 初始化失败不影响主要功能
      });
    }, 500);
  },

  // 加载评论列表
  loadComments: function (postId) {
    // 模拟从数据库加载评论
    const mockComments = this.getMockComments(postId);

    setTimeout(() => {
      this.setData({
        comments: mockComments,
      });
    }, 300);
  },

  // 点赞帖子
  likePost: function () {
    const post = this.data.post;
    if (!post) return;

    wx.showToast({
      title: post.liked ? "取消点赞" : "点赞成功",
      icon: "success",
      duration: 1000,
    });

    post.stats.like += post.liked ? -1 : 1;
    post.liked = !post.liked;

    this.setData({ post });
  },

  // 显示评论输入框
  showCommentInput: function (e) {
    const replyTo = e.currentTarget.dataset.replyto;
    this.setData({
      showCommentInput: true,
      replyTo: replyTo || null,
    });

    // 自动聚焦输入框
    setTimeout(() => {
      this.selectComponent("#comment-input").focus();
    }, 100);
  },

  // 隐藏评论输入框
  hideCommentInput: function () {
    this.setData({
      showCommentInput: false,
      newComment: "",
      replyTo: null,
    });
  },

  // 输入评论内容
  onCommentInput: function (e) {
    this.setData({
      newComment: e.detail.value,
    });
  },

  // 提交评论
  submitComment: function () {
    const { newComment, replyTo, post } = this.data;

    if (!newComment.trim()) {
      wx.showToast({
        title: "请输入评论内容",
        icon: "none",
      });
      return;
    }

    // 模拟用户信息
    const userInfo = {
      nickName: "当前用户",
      avatarUrl: "/images/default-avatar.png",
    };

    // 创建新评论
    const newCommentObj = {
      _id: "comment-" + Date.now(),
      userInfo: userInfo,
      content: newComment,
      replyTo: replyTo,
      createTime: new Date().toLocaleString("zh-CN"),
      likes: 0,
      liked: false,
    };

    // 添加到评论列表
    const comments = [...this.data.comments];

    if (replyTo) {
      // 如果是回复，找到被回复的评论并添加到其回复列表
      const parentCommentIndex = comments.findIndex((c) => c._id === replyTo);
      if (parentCommentIndex !== -1) {
        if (!comments[parentCommentIndex].replies) {
          comments[parentCommentIndex].replies = [];
        }
        comments[parentCommentIndex].replies.push(newCommentObj);
      }
    } else {
      // 直接评论
      comments.unshift(newCommentObj);
    }

    // 更新帖子评论数
    if (post) {
      post.stats.comment += 1;
    }

    this.setData({
      comments,
      post,
      newComment: "",
      showCommentInput: false,
      replyTo: null,
    });

    wx.showToast({
      title: "评论成功",
      icon: "success",
    });
  },

  // 点赞评论
  likeComment: function (e) {
    const commentId = e.currentTarget.dataset.commentid;
    const isReply = e.currentTarget.dataset.isreply;
    const parentId = e.currentTarget.dataset.parentid;

    const comments = [...this.data.comments];
    let comment = null;

    if (isReply && parentId) {
      // 点赞回复
      const parentComment = comments.find((c) => c._id === parentId);
      if (parentComment && parentComment.replies) {
        comment = parentComment.replies.find((r) => r._id === commentId);
      }
    } else {
      // 点赞主评论
      comment = comments.find((c) => c._id === commentId);
    }

    if (comment) {
      comment.likes += comment.liked ? -1 : 1;
      comment.liked = !comment.liked;

      this.setData({ comments });
    }
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

  // 模拟帖子详情数据
  getMockPost: function (postId) {
    const basePosts = [
      {
        _id: "post-detail-1",
        userInfo: {
          nickName: "无障碍热心市民",
          avatarUrl: "/images/default-avatar.png",
        },
        content:
          "今天在社区发现一个很棒的坡道设计，分享给大家参考！坡道坡度合适，两侧有扶手，非常适合轮椅使用者。这个设计考虑了不同用户的需求，包括轮椅使用者、推婴儿车的家长等。坡道表面采用了防滑材料，即使在雨天也能保证安全。",
        images: ["/images/icon1.jpeg", "/images/icon9.jpeg"],
        type: "share",
        stats: { view: 128, like: 24, comment: 8 },
        createTime: "2024-01-08 10:30:00",
        liked: false,
      },
      {
        _id: "post-detail-2",
        userInfo: {
          nickName: "视障用户小李",
          avatarUrl: "/images/default-avatar.png",
        },
        content:
          "求助：我们小区盲道被车辆占用严重，有什么好的解决方案吗？希望有经验的朋友分享一下。这种情况已经持续很久了，给我们的出行带来了很大困扰。",
        images: ["/images/icon9.jpeg"],
        type: "help",
        stats: { view: 256, like: 45, comment: 23 },
        createTime: "2024-01-07 15:20:00",
        liked: false,
      },
    ];

    return basePosts.find((post) => post._id === postId) || basePosts[0];
  },

  // 模拟评论数据
  getMockComments: function (postId) {
    return [
      {
        _id: "comment-1",
        userInfo: {
          nickName: "社区管理员",
          avatarUrl: "/images/default-avatar.png",
        },
        content: "这个坡道设计确实很人性化，感谢分享！",
        createTime: "2024-01-08 11:00:00",
        likes: 5,
        liked: false,
        replies: [
          {
            _id: "reply-1-1",
            userInfo: {
              nickName: "原帖作者",
              avatarUrl: "/images/default-avatar.png",
            },
            content: "谢谢认可！希望更多社区能参考这样的设计。",
            createTime: "2024-01-08 11:15:00",
            likes: 2,
            liked: false,
          },
        ],
      },
      {
        _id: "comment-2",
        userInfo: {
          nickName: "轮椅使用者小王",
          avatarUrl: "/images/default-avatar.png",
        },
        content: "作为轮椅使用者，我觉得这个设计非常实用！",
        createTime: "2024-01-08 10:45:00",
        likes: 8,
        liked: false,
      },
    ];
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
