// 初始化云开发环境 - 使用默认环境
wx.cloud.init({
  traceUser: true
});

const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 项目详情数据
    projectDetail: {
      title: "城市社区无障碍花园改造",
      subtitle: "示例：金科园社区花园营造",
      location: "长阳花园区",
      team: "刘新宇 唐培成 肖佳妮",
      year: "2025",
      area: "2234㎡",
      heroImage: "/images/24280.jpg",
      content: [
        {
          type: "text",
          content: "本项目位于北京市长阳花园区，是一个集社区花园、无障碍通道和儿童游乐区于一体的综合性社区改造项目。设计团队充分考虑了不同年龄层居民的需求，特别是残障人士和老年人的无障碍需求，打造了一个包容性强、生态友好的社区公共空间。"
        },
        {
          type: "image",
          url: "/images/24213.jpg",
          caption: "图1：项目整体鸟瞰图"
        },
        {
          type: "text",
          content: "项目设计理念以\"人与自然和谐共生\"为核心，通过合理的空间规划和植物配置，营造出四季有景、层次丰富的园林景观。同时，在各个功能区域之间设置了无障碍通道，确保所有居民都能便捷地使用社区设施。"
        },
        {
          type: "highlight",
          content: "无障碍设计是本项目的重点，包括轮椅坡道、盲道、无障碍座椅等设施，确保残障人士能够自由通行和休憩。"
        },
        {
          type: "text",
          content: "社区花园部分采用了模块化设计，居民可以认领种植箱进行花卉和蔬菜种植，增强了社区的凝聚力和互动性。儿童游乐区则设置了安全的游乐设施和沙坑，为孩子们提供了户外活动的空间。"
        },
        {
          type: "image",
          url: "/images/1444983318907-_DSC1826.jpg",
          caption: "图2：无障碍通道设计"
        },
        {
          type: "text",
          content: "项目于2025年完成，受到了居民的广泛好评。它不仅改善了社区环境，还促进了居民之间的交流和互动，成为了长阳花园区的一张新名片。"
        }
      ],
      gallery: [
        "/images/24280.jpg",
        "/images/24213.jpg",
        "/images/1444983318907-_DSC1826.jpg",
        "/images/icon1.jpeg",
        "/images/icon8.jpg",
        "/images/icon9.jpeg"
      ],
      designer: {
        avatar: "/images/icon8.jpg",
        name: "JKMM Architects",
        bio: "专注于可持续建筑和无障碍设计的国际建筑事务所"
      },
      tags: ["社区花园", "西方园艺", "工作坊", "百亩社区", "无障碍设计"]
    },
    
    // 社交交互数据
    commentList: [],
    isLiked: false,
    isCollected: false,
    commentContent: '',
    showCommentInputBox: false,
    postId: ''
  },
  
  onLoad: function(options) {
    const postId = options.postId || 'post-001';
    this.setData({ postId });
    this.initData(postId);
    this.watchComments(postId);
  },
  
  initData: function(postId) {
    const that = this;
    
    // 获取点赞状态
    db.collection('actions').where({
      postId: postId,
      _openid: '{openid}',
      type: 'like_post'
    }).get().then(res => {
      that.setData({ isLiked: res.data.length > 0 });
    });
    
    // 获取收藏状态
    db.collection('actions').where({
      postId: postId,
      _openid: '{openid}',
      type: 'collect_post'
    }).get().then(res => {
      that.setData({ isCollected: res.data.length > 0 });
    });
    
    // 获取评论列表
    db.collection('comments').where({
      postId: postId
    }).orderBy('createTime', 'desc').get().then(res => {
      const commentList = res.data.map(comment => ({
        ...comment,
        isLiked: false,
        createTime: this.formatTime(comment.createTime)
      }));
      that.setData({ commentList });
      that.getCommentLikeStatus(postId, commentList);
    });
  },
  
  getCommentLikeStatus: function(postId, commentList) {
    const that = this;
    db.collection('actions').where({
      postId: postId,
      _openid: '{openid}',
      type: 'like_comment'
    }).get().then(res => {
      const likedCommentIds = res.data.map(action => action.targetId);
      const updatedComments = commentList.map(comment => ({
        ...comment,
        isLiked: likedCommentIds.includes(comment._id)
      }));
      that.setData({ commentList: updatedComments });
    });
  },
  
  watchComments: function(postId) {
    const that = this;
    db.collection('comments').where({ postId: postId }).watch({
      onChange: function(snapshot) {
        const commentList = snapshot.docs.map(comment => ({
          ...comment,
          isLiked: false,
          createTime: that.formatTime(comment.createTime)
        }));
        that.setData({ commentList });
        that.getCommentLikeStatus(postId, commentList);
      },
      onError: function(err) {
        console.error('监听评论失败:', err);
      }
    });
  },
  
  formatTime: function(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
  
  goBack: function() {
    wx.navigateBack({ delta: 1 });
  },
  
  toggleLike: function() {
    const postId = this.data.postId;
    const isLiked = this.data.isLiked;
    this.setData({ isLiked: !isLiked });
    
    if (isLiked) {
      db.collection('actions').where({
        postId: postId,
        _openid: '{openid}',
        type: 'like_post'
      }).remove();
    } else {
      db.collection('actions').add({
        data: {
          postId: postId,
          type: 'like_post',
          createTime: db.serverDate()
        }
      });
    }
  },
  
  toggleCollect: function() {
    const postId = this.data.postId;
    const isCollected = this.data.isCollected;
    this.setData({ isCollected: !isCollected });
    
    if (isCollected) {
      db.collection('actions').where({
        postId: postId,
        _openid: '{openid}',
        type: 'collect_post'
      }).remove().then(() => {
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      });
    } else {
      db.collection('actions').add({
        data: {
          postId: postId,
          type: 'collect_post',
          createTime: db.serverDate()
        }
      }).then(() => {
        wx.showToast({ title: '收藏成功', icon: 'success' });
      });
    }
  },
  
  showCommentInput: function() {
    this.setData({ showCommentInputBox: true });
  },
  
  onCommentInput: function(e) {
    this.setData({ commentContent: e.detail.value });
  },
  
  submitComment: function() {
    const content = this.data.commentContent.trim();
    const postId = this.data.postId;
    
    if (!content) {
      wx.showToast({ title: '评论内容不能为空', icon: 'none' });
      return;
    }
    
    // 使用简化的评论方式，避免授权问题
    const userInfo = {
      nickName: '匿名用户',
      avatarUrl: 'https://thirdwx.qlogo.cn/mmopen/vi_32/POgEwh4mIHO4nibH0KlMECNjjGxQUq24ZEaGT4poC6icRiccVGKSyXwibcPq4BWmiaIGuG1icwxaQX6grC9VemZoJ8rg/132'
    };
    
    // 发送评论
    db.collection('comments').add({
      data: {
        postId: postId,
        content: content,
        userInfo: userInfo,
        likeCount: 0,
        createTime: db.serverDate()
      }
    }).then(() => {
      // 清空评论输入框并隐藏
      this.setData({ 
        commentContent: '', 
        showCommentInputBox: false 
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
    }).catch(err => {
      console.error('评论失败:', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
  },
  
  likeComment: function(e) {
    const commentId = e.currentTarget.dataset.commentid;
    const commentList = this.data.commentList;
    const postId = this.data.postId;
    
    const commentIndex = commentList.findIndex(item => item._id === commentId);
    if (commentIndex === -1) return;
    
    const comment = commentList[commentIndex];
    const isLiked = comment.isLiked;
    
    const updatedComment = {
      ...comment,
      isLiked: !isLiked,
      likeCount: isLiked ? comment.likeCount - 1 : comment.likeCount + 1
    };
    
    const updatedCommentList = [...commentList];
    updatedCommentList[commentIndex] = updatedComment;
    this.setData({ commentList: updatedCommentList });
    
    if (isLiked) {
      db.collection('actions').where({
        postId: postId,
        targetId: commentId,
        _openid: '{openid}',
        type: 'like_comment'
      }).remove().then(() => {
        db.collection('comments').doc(commentId).update({
          data: { likeCount: _.inc(-1) }
        });
      });
    } else {
      db.collection('actions').add({
        data: {
          postId: postId,
          targetId: commentId,
          type: 'like_comment',
          createTime: db.serverDate()
        }
      }).then(() => {
        db.collection('comments').doc(commentId).update({
          data: { likeCount: _.inc(1) }
        });
      });
    }
  },
  
  onShare: function() {
    return {
      title: this.data.projectDetail.title,
      path: '/pages/case-detail/case-detail?postId=' + this.data.postId,
      imageUrl: this.data.projectDetail.heroImage
    };
  }
});