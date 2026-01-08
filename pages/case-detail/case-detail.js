// 获取全局应用实例
const app = getApp();

// 初始化云数据库
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
    showCommentInputBox: false,
    postId: '',
    // 新的评论输入值
    inputValue: '',
    // 标记是否已启动评论监听
    watchStarted: false
  },
  
  onLoad: function(options) {
    const postId = options.postId || 'post-001';
    this.setData({ postId });
    this.initData(postId);
    // 只有在用户登录后才启动实时监听
    if (app.globalData.openid) {
      this.watchComments(postId);
    }
  },
  
  onShow: function() {
    // 页面显示时检查登录状态，如果已登录但未启动监听，则启动监听
    if (app.globalData.openid && this.data.postId && !this.data.watchStarted) {
      this.watchComments(this.data.postId);
      // 标记监听已启动
      this.setData({ watchStarted: true });
    }
  },
  
  // 检查登录状态
  checkLogin: function() {
    const that = this;
    return app.checkLogin().catch(() => {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        success: (res) => {
          if (res.confirm) {
            that.login();
          }
        }
      });
      throw new Error('未登录');
    });
  },
  
  // 执行登录
  login: function() {
    const that = this;
    app.login().then(userData => {
      wx.showToast({ title: '登录成功', icon: 'success' });
      // 登录成功后启动实时监听
      that.watchComments(that.data.postId);
      // 登录成功后重新获取交互状态
      that.getActionStatus(that.data.postId);
      that.getCommentLikeStatus(that.data.postId, that.data.commentList);
    }).catch(err => {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },
  
  initData: function(postId) {
    const that = this;
    
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
      // 只有登录后才获取评论点赞状态
      if (app.globalData.openid) {
        that.getCommentLikeStatus(postId, commentList);
      }
    });
    
    // 只有登录后才获取点赞和收藏状态
    if (app.globalData.openid) {
      that.getActionStatus(postId);
    }
  },
  
  // 获取点赞和收藏状态
  getActionStatus: function(postId) {
    const that = this;
    const openid = app.globalData.openid;
    
    // 获取点赞状态
    db.collection('actions').where({
      postId: postId,
      _openid: openid,
      type: 'like_post'
    }).get().then(res => {
      that.setData({ isLiked: res.data.length > 0 });
    });
    
    // 获取收藏状态
    db.collection('actions').where({
      postId: postId,
      _openid: openid,
      type: 'collect_post'
    }).get().then(res => {
      that.setData({ isCollected: res.data.length > 0 });
    });
  },
  
  getCommentLikeStatus: function(postId, commentList) {
    const that = this;
    const openid = app.globalData.openid;
    
    if (!openid) return;
    
    db.collection('actions').where({
      postId: postId,
      _openid: openid,
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
    // 检查登录状态，只有登录后才启动监听
    if (!app.globalData.openid) {
      console.log('未登录，无法启动评论实时监听');
      return;
    }
    
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
    const that = this;
    
    // 1. 检查登录状态
    this.checkLogin().then(() => {
      // 2. 获取当前状态
      const isLiked = this.data.isLiked;
      const postId = this.data.postId;
      const { title, heroImage } = this.data.projectDetail;
      
      // 3. [关键] 立即更新 UI (震动反馈 + 状态取反)
      wx.vibrateShort();
      this.setData({ isLiked: !isLiked });
      
      // 4. 后台静默处理云数据库
      const db = wx.cloud.database();
      const _cmd = db.command;
      
      if (!isLiked) {
        // 之前没赞 -> 添加点赞记录
        db.collection('actions').add({
          data: {
            postId: postId,
            type: 'like_post',
            title: title,
            coverImg: heroImage,
            createTime: db.serverDate()
          }
        }).then(() => {
          wx.showToast({ title: '点赞成功', icon: 'success' });
        }).catch(err => {
          console.error('点赞失败:', err);
          // 如果失败，回滚 UI
          that.setData({ isLiked: isLiked });
          wx.showToast({ title: '点赞失败', icon: 'none' });
        });
      } else {
        // 之前赞了 -> 删除点赞记录
        db.collection('actions').where({
          postId: postId,
          _openid: app.globalData.openid,
          type: 'like_post'
        }).remove().then(() => {
          wx.showToast({ title: '已取消点赞', icon: 'success' });
        }).catch(err => {
          console.error('取消点赞失败:', err);
          // 如果失败，回滚 UI
          that.setData({ isLiked: isLiked });
          wx.showToast({ title: '取消点赞失败', icon: 'none' });
        });
      }
    }).catch(() => {
      // 未登录，不做任何操作
    });
  },
  
  toggleCollect: function() {
    const that = this;
    
    // 1. 检查登录状态
    this.checkLogin().then(() => {
      // 2. 获取当前状态
      const isCollected = this.data.isCollected;
      const postId = this.data.postId;
      const { title, heroImage } = this.data.projectDetail;
      
      // 3. [关键] 立即更新 UI (震动反馈 + 状态取反)
      wx.vibrateShort();
      this.setData({ isCollected: !isCollected });
      
      // 4. 后台静默处理云数据库
      const db = wx.cloud.database();
      const _cmd = db.command;
      
      if (!isCollected) {
        // 之前没收藏 -> 添加收藏记录
        db.collection('actions').add({
          data: {
            postId: postId,
            type: 'collect_post',
            title: title,
            coverImg: heroImage,
            createTime: db.serverDate()
          }
        }).then(() => {
          wx.showToast({ title: '收藏成功', icon: 'success' });
        }).catch(err => {
          console.error('收藏失败:', err);
          // 如果失败，回滚 UI
          that.setData({ isCollected: isCollected });
          wx.showToast({ title: '收藏失败', icon: 'none' });
        });
      } else {
        // 之前收藏了 -> 删除收藏记录
        db.collection('actions').where({
          postId: postId,
          _openid: app.globalData.openid,
          type: 'collect_post'
        }).remove().then(() => {
          wx.showToast({ title: '已取消收藏', icon: 'success' });
        }).catch(err => {
          console.error('取消收藏失败:', err);
          // 如果失败，回滚 UI
          that.setData({ isCollected: isCollected });
          wx.showToast({ title: '取消收藏失败', icon: 'none' });
        });
      }
    }).catch(() => {
      // 未登录，不做任何操作
    });
  },
  
  showCommentInput: function() {
    const that = this;
    this.checkLogin().then(() => {
      that.setData({ showCommentInputBox: true });
    });
  },
  
  // 监听输入
  onInput(e) {
    console.log("正在输入:", e.detail.value);
    this.setData({
      inputValue: e.detail.value
    });
  },
  
  // 取消评论
  onCancelComment() {
    console.log("点击取消按钮");
    // 清空输入内容
    this.setData({ 
      inputValue: '', 
      showCommentInputBox: false 
    });
    
    // 隐藏键盘
    wx.hideKeyboard();
  },
  
  // 提交评论
  submitComment() {
    const content = this.data.inputValue;
    const postId = this.data.postId;
    console.log("点击发送，当前内容:", content);

    if (!content || !content.trim()) {
      wx.showToast({ title: '评论不能为空', icon: 'none' });
      return;
    }

    // 检查用户是否登录
    if (!app.globalData.userInfo || !app.globalData.openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.login();
      return;
    }

    // 使用登录用户的信息
    const userInfo = app.globalData.userInfo;
    
    // 准备发送云函数
    console.log("准备发送评论到云数据库...");
    
    // 获取文章标题
    const postTitle = this.data.projectDetail.title;
    
    // 发送评论到云数据库
    db.collection('comments').add({
      data: {
        postId: postId,
        content: content.trim(),
        userInfo: userInfo,
        likeCount: 0,
        postTitle: postTitle,
        createTime: db.serverDate()
      }
    }).then(() => {
      console.log("评论发送成功");
      // 清空输入内容并隐藏评论框
      this.setData({ 
        inputValue: '', 
        showCommentInputBox: false 
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
      // 隐藏键盘
      wx.hideKeyboard();
    }).catch(err => {
      console.error('评论失败:', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
  },
  
  likeComment: function(e) {
    const that = this;
    this.checkLogin().then(() => {
      const commentId = e.currentTarget.dataset.commentid;
      const commentList = that.data.commentList;
      const postId = that.data.postId;
      const openid = app.globalData.openid;
      
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
      that.setData({ commentList: updatedCommentList });
      
      if (isLiked) {
        db.collection('actions').where({
          postId: postId,
          targetId: commentId,
          _openid: openid,
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
    });
  },
  
  onShare: function() {
    return {
      title: this.data.projectDetail.title,
      path: '/pages/case-detail/case-detail?postId=' + this.data.postId,
      imageUrl: this.data.projectDetail.heroImage
    };
  }
});