// pages/comment-notifications/index.js
const app = getApp();

Page({
  data: {
    notifications: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad: function() {
    this.loadNotifications(true);
  },

  onPullDownRefresh: function() {
    this.loadNotifications(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadNotifications(false);
    }
  },

  loadNotifications: function(refresh) {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
      });
      return Promise.resolve();
    }

    if (this.data.loading) return Promise.resolve();

    const nextPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    // 1. 先获取我的帖子ID列表
    return wx.cloud.database().collection('posts')
      .where({ _openid: openid })
      .field({ _id: true, title: true, content: true, images: true })
      .get()
      .then(res => {
        const myPosts = res.data || [];
        const postIds = myPosts.map(p => p._id);
        
        if (postIds.length === 0) {
          this.setData({
            notifications: [],
            loading: false,
            hasMore: false
          });
          return;
        }

        // 构建帖子映射
        const postMap = {};
        myPosts.forEach(post => {
          postMap[post._id] = {
            title: post.title || post.content || '未命名',
            image: (post.images && post.images[0]) || '/images/24213.jpg'
          };
        });

        // 2. 查询评论记录
        const db = wx.cloud.database();
        const _ = db.command;
        
        // 查询所有评论
        return db.collection('comments')
          .where({
            postId: _.in(postIds)
          })
          .orderBy('createTime', 'desc')
          .get()
          .then(async allCommentsRes => {
            const allComments = allCommentsRes.data || [];
            
            // 过滤掉自己的评论
            const comments = allComments.filter(c => c._openid !== openid);
            
            // 分页处理
            const start = (nextPage - 1) * this.data.pageSize;
            const end = start + this.data.pageSize;
            const pagedComments = comments.slice(start, end);
            
            if (pagedComments.length === 0) {
              this.setData({
                notifications: refresh ? [] : this.data.notifications,
                loading: false,
                hasMore: false,
                page: nextPage
              });
              return;
            }

            // 3. 获取评论用户的信息
            const userIds = [...new Set(pagedComments.map(c => c._openid))];
            const userInfoPromises = userIds.map(userId => {
              return wx.cloud.callFunction({
                name: 'getUserInfo',
                data: { targetId: userId }
              }).then(res => {
                if (res.result && res.result.success) {
                  return {
                    _openid: userId,
                    userInfo: res.result.data.userInfo || { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
                    userType: res.result.data.userType || 'normal' // ✅ 获取 userType
                  };
                }
                return {
                  _openid: userId,
                  userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
                  userType: 'normal'
                };
              }).catch(() => ({
                _openid: userId,
                userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
                userType: 'normal'
              }));
            });

            const usersData = await Promise.all(userInfoPromises);
            const userMap = {};
            usersData.forEach(u => {
              userMap[u._openid] = {
                userInfo: u.userInfo,
                userType: u.userType
              };
            });

            // 4. 组装通知数据
            const notifications = pagedComments.map(comment => {
              const userData = userMap[comment._openid] || { 
                userInfo: { nickName: '未知用户', avatarUrl: '/images/zhi.png' },
                userType: 'normal'
              };
              const postInfo = postMap[comment.postId] || { title: '未知帖子', image: '/images/24213.jpg' };

              // 截取帖子标题前20个字
              let postTitle = postInfo.title || '未知帖子';
              if (postTitle.length > 20) {
                postTitle = postTitle.substring(0, 20) + '...';
              }

              return {
                id: comment._id,
                userId: comment._openid,
                userName: userData.userInfo.nickName,
                userAvatar: userData.userInfo.avatarUrl,
                userType: userData.userType, // ✅ 添加 userType
                commentContent: comment.content || '评论内容',
                postId: comment.postId,
                postTitle: postTitle,
                postImage: postInfo.image,
                time: this.formatTime(comment.createTime),
                createTime: comment.createTime
              };
            });

            const allNotifications = refresh 
              ? notifications 
              : this.data.notifications.concat(notifications);

            this.setData({
              notifications: allNotifications,
              loading: false,
              hasMore: comments.length > end,
              page: nextPage
            });
          });
      })
      .catch(err => {
        console.error('加载评论通知失败:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  formatTime: function(date) {
    if (!date) return '';
    
    let d;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else if (date.toDate) {
      d = date.toDate();
    } else {
      return '';
    }

    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    } else if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else if (minutes > 0) {
      return `${minutes}分钟前`;
    } else {
      return '刚刚';
    }
  },

  onUserTap: function(e) {
    const userId = e.currentTarget.dataset.userid;
    if (userId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${userId}`
      });
    }
  },

  onPostTap: function(e) {
    const postId = e.currentTarget.dataset.postid;
    if (postId) {
      wx.navigateTo({
        url: `/pages/post-detail/index?id=${postId}`
      });
    }
  }
});

