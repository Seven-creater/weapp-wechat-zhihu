// pages/post-detail/index.js
const app = getApp();
const collectUtil = require('../../utils/collect.js');
const followUtil = require('../../utils/follow.js');
const { checkPermission, checkAndExecute } = require('../../utils/permission.js');

let db = null;
let _ = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
    _ = db.command;
  }
  return { db, _ };
};

Page({
  data: {
    postId: '',
    post: null,
    comments: [],
    newComment: '',
    replyToId: '',
    replyToName: '',
    isInputFocus: false,
    placeholderText: '说点什么...',
    loading: true,
    isCollected: false,
    collectCount: 0,
    isFollowing: false,
    likeCount: 0,
    isLiked: false,
    showProfessionalActions: false,
    canVerifyIssue: false,
    canDesignSolution: false,
    canCreateProject: false,
    canUpdateProgress: false,
    canViewUserContact: false,
    
    // 关联内容
    linkedProposal: null,
    linkedProject: null,
    showLinkedContent: false,
    proposalCount: 0,
    
    // 专业操作权限
    isDesigner: false,
    isContractor: false,
    isCommunityWorker: false,
    isPostOwner: false,
    
    // 管理员权限
    isAdmin: false,
  },

  onLoad(options) {
    const postId = options.id || options.postId;
    if (!postId) {
      wx.showToast({ title: '帖子不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ postId });
    this.loadPostDetail();
    this.loadComments();
    this.checkProfessionalPermissions();
  },

  onShow() {
    if (this.data.postId) {
      this.loadPostDetail();
      this.loadComments();
    }
  },

  onPullDownRefresh() {
    this.loadPostDetail();
    this.loadComments();
    wx.stopPullDownRefresh();
  },

  checkProfessionalPermissions() {
    const userType = app.globalData.userType || wx.getStorageSync('userType');
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    // 检查是否是管理员
    const adminOpenids = [
      'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',  // 第一位管理员
      'oOJhu3T9Us9TAnibhfctmyRw2Urc'   // 第二位管理员
    ];
    const isAdmin = adminOpenids.includes(openid);
    
    // 判断用户角色
    const isDesigner = userType === 'designer';
    const isContractor = userType === 'contractor';
    const isCommunityWorker = userType === 'communityWorker';
    
    // 判断是否是帖子作者
    const isPostOwner = this.data.post && this.data.post._openid === openid;
    
    this.setData({
      isDesigner: isDesigner,
      isContractor: isContractor,
      isCommunityWorker: isCommunityWorker,
      isPostOwner: isPostOwner,
      isAdmin: isAdmin,
      showProfessionalActions: this.data.post && this.data.post.type === 'issue'
    });
  },

  loadPostDetail() {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getPublicData',
      data: {
        collection: 'posts',
        docId: this.data.postId
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const post = res.result.data;
        if (post.createTime) {
          post.createTime = this.formatTime(post.createTime);
        }
        if (!post.stats) {
          post.stats = { like: 0, comment: 0, collect: 0 };
        }
        const openid = app.globalData.openid || wx.getStorageSync('openid');
        post.isOwner = post._openid === openid;
        
        // 检查是否是管理员
        const adminOpenids = [
          'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',  // 第一位管理员
          'oOJhu3T9Us9TAnibhfctmyRw2Urc'   // 第二位管理员
        ];
        const isAdmin = adminOpenids.includes(openid);
        post.canDelete = post.isOwner || isAdmin; // 作者或管理员可以删除
        
        // 🔍 调试日志
        console.log('🔍 当前用户 openid:', openid);
        console.log('🔍 管理员列表:', adminOpenids);
        console.log('🔍 是否是管理员:', isAdmin);
        console.log('🔍 是否是作者:', post.isOwner);
        console.log('🔍 是否可以删除:', post.canDelete);
        
        this.setData({
          post,
          loading: false,
          likeCount: post.stats.like || 0
        });

        // 实时查询作者的最新用户信息
        if (post._openid) {
          wx.cloud.callFunction({
            name: 'getUserInfo',
            data: { targetId: post._openid }
          }).then(userRes => {
            if (userRes.result && userRes.result.success && userRes.result.data) {
              const userData = userRes.result.data;
              const updatedUserInfo = userData.userInfo || post.userInfo;
              const updatedUserType = userData.userType || post.userType;
              
              this.setData({
                'post.userInfo': updatedUserInfo,
                'post.userType': updatedUserType
              });
            }
          }).catch(err => {
            console.error('查询作者信息失败:', err);
          });
        }
        
        // 加载关联内容（设计方案和项目）
        this.loadLinkedContent();
        
        // ✅ 重新检查专业权限（此时 post 数据已加载）
        this.checkProfessionalPermissions();
        
        collectUtil.initCollectStatus(this, 'collect_post', this.data.postId).catch(() => {});
        this.checkLikeStatus();
        this.checkFollowStatus();
      } else {
        throw new Error(res.result?.error || '加载失败');
      }
    }).catch(err => {
      console.error('加载帖子详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }).finally(() => {
      wx.hideLoading();
    });
  },

  // 加载关联的设计方案和项目
  loadLinkedContent() {
    if (!this.data.post || this.data.post.type !== 'issue') {
      return;
    }

    // 查询关联的设计方案数量
    wx.cloud.callFunction({
      name: 'getDesignProposals',
      data: { issueId: this.data.postId }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          proposalCount: res.result.data.length,
          showLinkedContent: res.result.data.length > 0
        });
      }
    }).catch(err => {
      console.log('查询设计方案失败:', err);
    });

    // 查询关联的项目
    wx.cloud.callFunction({
      name: 'getProjectByIssue',
      data: { issueId: this.data.postId }
    }).then(res => {
      if (res.result && res.result.success && res.result.data) {
        this.setData({
          linkedProject: res.result.data,
          showLinkedContent: true
        });
      }
    }).catch(err => {
      console.log('未找到关联的项目');
    });
  },

  // 查看设计方案列表
  viewProposalList() {
    wx.navigateTo({
      url: `/pages/design/proposal-list/index?issueId=${this.data.postId}`
    });
  },

  // 查看项目详情
  viewProject() {
    if (this.data.linkedProject) {
      wx.navigateTo({
        url: `/pages/project/detail/index?id=${this.data.linkedProject._id}`
      });
    }
  },

  // 设计师：添加设计方案
  addDesignSolution() {
    if (!this.data.isDesigner) {
      wx.showToast({
        title: '仅设计师可操作',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/design/solution/create?postId=${this.data.postId}`
    });
  },

  // 施工方：创建项目
  createProject() {
    if (!this.data.isContractor) {
      wx.showToast({
        title: '仅施工方可操作',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/project/create/index?postId=${this.data.postId}`
    });
  },

  // 施工方：更新项目节点
  updateProjectNode() {
    if (!this.data.isContractor) {
      wx.showToast({
        title: '仅施工方可操作',
        icon: 'none'
      });
      return;
    }

    if (!this.data.linkedProject) {
      wx.showToast({
        title: '请先创建项目',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/project/detail/index?id=${this.data.linkedProject._id}`
    });
  },

  // 施工方和社区工作者：查看联系方式
  viewContactInfo() {
    if (!this.data.isContractor && !this.data.isCommunityWorker) {
      wx.showToast({
        title: '仅施工方和社区工作者可操作',
        icon: 'none'
      });
      return;
    }

    const post = this.data.post;
    if (!post || !post._openid) {
      wx.showToast({
        title: '无法获取用户信息',
        icon: 'none'
      });
      return;
    }

    // 调用云函数获取用户联系方式
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: { targetId: post._openid }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success && res.result.data) {
        const userData = res.result.data;
        const phoneNumber = userData.phoneNumber || '';
        const nickName = userData.userInfo?.nickName || '用户';
        
        if (!phoneNumber) {
          wx.showModal({
            title: '联系方式',
            content: '该用户未填写联系方式',
            showCancel: false
          });
          return;
        }

        wx.showModal({
          title: `${nickName}的联系方式`,
          content: `手机号：${phoneNumber}`,
          confirmText: '拨打电话',
          cancelText: '取消',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.makePhoneCall({
                phoneNumber: phoneNumber,
                fail: (err) => {
                  console.error('拨打电话失败:', err);
                  wx.showToast({
                    title: '拨打失败',
                    icon: 'none'
                  });
                }
              });
            }
          }
        });
      } else {
        wx.showToast({
          title: '获取联系方式失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('获取联系方式失败:', err);
      wx.showToast({
        title: '获取失败',
        icon: 'none'
      });
    });
  },

  // 确认项目完成（发帖者或社区工作者）
  confirmProjectCompletion() {
    if (!this.data.isPostOwner && !this.data.isCommunityWorker) {
      wx.showToast({
        title: '无权限操作',
        icon: 'none'
      });
      return;
    }

    if (!this.data.linkedProject) {
      wx.showToast({
        title: '该帖子没有关联项目',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认完成',
      content: '确认该项目已完成？完成后将移至案例板块。',
      success: (res) => {
        if (res.confirm) {
          this.doConfirmCompletion();
        }
      }
    });
  },

  // 执行确认完成
  doConfirmCompletion() {
    wx.showLoading({ title: '处理中...' });

    wx.cloud.callFunction({
      name: 'confirmProjectCompletion',
      data: {
        projectId: this.data.linkedProject._id,
        postId: this.data.postId,
        confirmedBy: this.data.isCommunityWorker ? 'communityWorker' : 'owner'
      }
    }).then(res => {
      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({
          title: '确认成功',
          icon: 'success'
        });

        // 刷新页面
        setTimeout(() => {
          this.loadPostDetail();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '确认失败');
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('确认失败:', err);
      wx.showToast({
        title: err.message || '确认失败',
        icon: 'none'
      });
    });
  },

  checkLikeStatus() {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return;
    const { db, _ } = getDB();
    db.collection('actions').where({
      _openid: openid,
      type: _.in(['like_post', 'like']),
      targetId: this.data.postId
    }).count().then(res => {
      this.setData({ isLiked: res.total > 0 });
    }).catch(err => {
      console.error('检查点赞状态失败:', err);
    });
  },

  loadComments() {
    const { db, _ } = getDB();
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    console.log('🔍 开始加载评论，postId:', this.data.postId);
    
    // 检查是否是管理员
    const adminOpenids = [
      'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',  // 第一位管理员
      'oOJhu3T9Us9TAnibhfctmyRw2Urc'   // 第二位管理员
    ];
    const isAdmin = adminOpenids.includes(openid);

    db.collection('comments')
      .where({ postId: this.data.postId })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        console.log('📊 查询到的评论总数:', res.data.length);
        const allComments = res.data;
        
        if (allComments.length === 0) { 
          this.setData({ comments: [] }); 
        return;
      }

        const commentIds = allComments.map(c => c._id);
        const authorIds = [...new Set(allComments.map(c => c._openid).filter(Boolean))];
        
        const likesPromise = openid ? 
          db.collection('actions').where({ 
        _openid: openid,
            type: _.in(['like_comment', 'like']), 
            targetId: _.in(commentIds) 
          }).get() : 
          Promise.resolve({ data: [] });

        const usersPromise = Promise.all(
          authorIds.map(authorId => 
            wx.cloud.callFunction({
            name: 'getUserInfo',
              data: { targetId: authorId }
          }).then(res => {
            if (res.result && res.result.success) {
              return {
                  openid: authorId,
                  userInfo: res.result.data.userInfo || { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                  userType: res.result.data.userType || 'CommunityWorker'
              };
            }
            return {
                openid: authorId,
                userInfo: { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                userType: 'CommunityWorker'
            };
            }).catch(err => {
              console.error('查询用户信息失败:', authorId, err);
              return {
                openid: authorId,
                userInfo: { avatarUrl: '/images/default-avatar.png', nickName: '微信用户' },
                userType: 'CommunityWorker'
              };
            })
          )
        );

        return Promise.all([likesPromise, usersPromise]).then(([likesRes, usersData]) => {
          const likedMap = new Set();
          likesRes.data.forEach(like => likedMap.add(like.targetId));
          
          const userMap = new Map();
          usersData.forEach(user => {
            userMap.set(user.openid, {
              userInfo: user.userInfo,
              userType: user.userType
            });
        });
        
          console.log('❤️ 已点赞的评论数:', likedMap.size);
          console.log('👥 查询到的用户数:', userMap.size);

          const mainComments = [];
          const repliesMap = {};
          
          allComments.forEach(comment => {
            comment.createTime = this.formatTime(comment.createTime);
            comment.isOwner = comment._openid === openid;
            comment.canDelete = comment.isOwner || isAdmin; // 作者或管理员可以删除
            comment.likes = comment.likes || comment.likeCount || 0;
            comment.liked = likedMap.has(comment._id);

            const userData = userMap.get(comment._openid);
            if (userData) {
              comment.userInfo = userData.userInfo;
              comment.userType = userData.userType;
            } else {
              if (!comment.userInfo) {
                comment.userInfo = { 
                  avatarUrl: '/images/default-avatar.png', 
                  nickName: '微信用户' 
                };
              }
              if (!comment.userType) {
                comment.userType = 'CommunityWorker';
              }
            }

            if (!comment.parentId) { 
              comment.replies = []; 
              mainComments.push(comment); 
          } else {
              if (!repliesMap[comment.parentId]) {
                repliesMap[comment.parentId] = [];
              }
              repliesMap[comment.parentId].push(comment); 
          }
        });

          mainComments.forEach(comment => { 
            if (repliesMap[comment._id]) {
              comment.replies = repliesMap[comment._id]; 
            }
          });
          
          console.log('✅ 主评论数量:', mainComments.length);
          this.setData({ comments: mainComments });
        });
      })
      .catch(err => {
        console.error('❌ 加载评论失败:', err);
      });
  },

  checkFollowStatus() {
    if (!this.data.post || this.data.post.isOwner) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) return;
    
    followUtil.checkFollowStatus(this.data.post._openid)
      .then(isFollowing => {
        this.setData({ isFollowing });
      })
      .catch(err => {
        console.error('检查关注状态失败:', err);
      });
  },

  likePost() {
    if (!this.data.post) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const newLikeStatus = !this.data.isLiked;
    const newLikeCount = newLikeStatus ? this.data.likeCount + 1 : Math.max(0, this.data.likeCount - 1);
    this.setData({
      isLiked: newLikeStatus,
      likeCount: newLikeCount
    });

    wx.cloud.callFunction({
      name: 'toggleInteraction',
      data: {
        id: this.data.postId,
        collection: 'posts',
        type: 'like'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          isLiked: res.result.status,
          likeCount: res.result.count || newLikeCount
        });
    const post = this.data.post;
        post.stats.like = res.result.count || newLikeCount;
        this.setData({ post });
              } else {
        this.setData({
          isLiked: !newLikeStatus,
          likeCount: this.data.likeCount
        });
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('点赞失败:', err);
      this.setData({
        isLiked: !newLikeStatus,
        likeCount: this.data.likeCount
      });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  toggleCollect() {
    collectUtil.toggleCollect(this, 'collect_post', this.data.postId, this.data.post)
      .then(() => {
        wx.showToast({
          title: this.data.isCollected ? '收藏成功' : '已取消收藏',
          icon: 'success'
        });
          })
      .catch(err => {
        console.error('收藏操作失败:', err);
        if (err.message !== '未登录') {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      });
  },

  toggleFollow() {
    if (!this.data.post) return;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const targetId = this.data.post._openid;
    const isFollowing = this.data.isFollowing;

    wx.showLoading({ title: '处理中...' });

    const promise = isFollowing 
      ? followUtil.unfollowUser(targetId)
      : followUtil.followUser(targetId);

    promise
      .then(() => {
        wx.hideLoading();
        this.setData({ isFollowing: !isFollowing });
        wx.showToast({ 
          title: isFollowing ? '已取消关注' : '关注成功', 
          icon: 'success' 
        });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('操作失败:', err);
        wx.showToast({ 
          title: err.message || '操作失败', 
          icon: 'none' 
        });
      });
  },

  showCommentInput(e) {
    const replyToId = e.currentTarget.dataset.replyto || '';
    const replyToName = e.currentTarget.dataset.replyname || '';
    const placeholderText = replyToId ? `回复 ${replyToName}...` : '说点什么...';
    this.setData({
      replyToId,
      replyToName,
      placeholderText,
      isInputFocus: true
    });
  },

  onCommentInput(e) {
    this.setData({ newComment: e.detail.value });
  },

  onInputBlur() {
    setTimeout(() => {
    this.setData({ isInputFocus: false });
    }, 200);
  },

  submitComment() {
    const content = this.data.newComment.trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });
      const { db } = getDB();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    const userType = app.globalData.userType || wx.getStorageSync('userType') || 'CommunityWorker';

      const commentData = {
      postId: this.data.postId,
      content: content,
      parentId: this.data.replyToId || null,
      userInfo: {
        nickName: userInfo.nickName || '微信用户',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
        },
      userType: userType,
        likes: 0,
      likeCount: 0,
      createTime: db.serverDate()
    };

    console.log('💬 提交评论数据:', commentData);

    db.collection('comments')
      .add({ data: commentData })
      .then(() => {
        wx.showToast({ title: '评论成功', icon: 'success' });
        this.setData({
          newComment: '',
          replyToId: '',
          replyToName: '',
          placeholderText: '说点什么...',
          isInputFocus: false
        });
        this.loadComments();
        
        if (this.data.post) {
          const post = this.data.post;
          post.stats.comment = (post.stats.comment || 0) + 1;
          this.setData({ post });
        }
      })
      .catch(err => {
        console.error('评论失败:', err);
        wx.showToast({ title: '评论失败', icon: 'none' });
      })
      .finally(() => {
      wx.hideLoading();
      });
  },

  likeComment(e) {
    const { commentid } = e.currentTarget.dataset;
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.cloud.callFunction({
      name: 'toggleInteraction',
      data: {
        id: commentid,
        collection: 'comments',
        type: 'like'
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.loadComments();
      }
    }).catch(err => {
      console.error('点赞评论失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  deleteComment(e) {
    const { commentid } = e.currentTarget.dataset;
          wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
            success: (res) => {
              if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deleteComment',
            data: {
              commentId: commentid,
              postId: this.data.postId
            }
          }).then(res => {
            if (res.result && res.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadComments();
              
              if (this.data.post) {
                const post = this.data.post;
                post.stats.comment = Math.max(0, (post.stats.comment || 0) - 1);
                this.setData({ post });
          }
        } else {
              throw new Error(res.result?.error || '删除失败');
            }
          }).catch(err => {
            console.error('删除评论失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }).finally(() => {
            wx.hideLoading();
          });
        }
      }
    });
  },

  deletePost() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这篇帖子吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deletePost',
            data: { postId: this.data.postId }
          }).then(res => {
            if (res.result && res.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            } else {
              throw new Error(res.result?.error || '删除失败');
            }
          }).catch(err => {
            console.error('删除帖子失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }).finally(() => {
            wx.hideLoading();
          });
        }
      }
    });
  },

  previewImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  sharePost() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  navigateToProfile(e) {
    const openid = e.currentTarget.dataset.id;
    if (openid) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${openid}`
      });
    }
  },

  navigateToUserProfile(e) {
    const openid = e.currentTarget.dataset.openid;
    if (openid) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${openid}`
      });
    }
  },

  verifyIssue() {
    checkAndExecute(['Designer', 'ConstructionTeam', 'Government'], () => {
      wx.showModal({
        title: '核实问题',
        content: '确认该问题真实存在吗？',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '核实中...' });
            wx.cloud.callFunction({
              name: 'verifyIssue',
              data: { postId: this.data.postId }
            }).then(res => {
              if (res.result && res.result.success) {
                wx.showToast({ title: '核实成功', icon: 'success' });
                this.loadPostDetail();
              } else {
                throw new Error(res.result?.error || '核实失败');
              }
            }).catch(err => {
              console.error('核实失败:', err);
              wx.showToast({ title: '核实失败', icon: 'none' });
            }).finally(() => {
              wx.hideLoading();
            });
          }
        }
      });
    });
  },

  createDesignSolution() {
    checkAndExecute(['Designer'], () => {
      wx.navigateTo({
        url: `/pages/design-solution/create?postId=${this.data.postId}`
      });
    });
  },

  submitQuote() {
    checkAndExecute(['ConstructionTeam'], () => {
      wx.navigateTo({
        url: `/pages/quote/create?postId=${this.data.postId}`
      });
    });
  },

  viewUserContact() {
    checkAndExecute(['Government'], () => {
      wx.showLoading({ title: '加载中...' });
      wx.cloud.callFunction({
        name: 'getUserContact',
        data: { userId: this.data.post._openid }
      }).then(res => {
        if (res.result && res.result.success) {
          const contact = res.result.data;
          wx.showModal({
            title: '用户联系方式',
            content: `姓名：${contact.name || '未填写'}\n电话：${contact.phone || '未填写'}`,
            showCancel: false
          });
        } else {
          throw new Error(res.result?.error || '获取失败');
        }
      }).catch(err => {
        console.error('获取联系方式失败:', err);
        wx.showToast({ title: '获取失败', icon: 'none' });
      }).finally(() => {
        wx.hideLoading();
        });
      });
  },

  formatTime(date) {
    if (!date) return '';
    
    let target;
    if (date instanceof Date) {
      target = date;
    } else if (typeof date === 'number') {
      target = new Date(date);
    } else if (typeof date === 'string') {
      target = new Date(date);
    } else if (date.$date) {
      target = new Date(date.$date);
    } else {
      return '';
    }

    const now = new Date();
    const diff = now - target;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  },

  onShareAppMessage() {
    return {
      title: this.data.post?.content || '查看帖子详情',
      path: `/pages/post-detail/index?id=${this.data.postId}`,
      imageUrl: this.data.post?.images?.[0] || ''
    };
  },

  onShareTimeline() {
    return {
      title: this.data.post?.content || '查看帖子详情',
      query: `id=${this.data.postId}`,
      imageUrl: this.data.post?.images?.[0] || ''
    };
  }
});
