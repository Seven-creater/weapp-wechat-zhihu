Page({
  data: {
    posts: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10
  },

  onLoad: function() {
    this.loadPosts();
  },

  onShow: function() {
    // 页面显示时刷新数据
    this.refreshPosts();
  },

  onPullDownRefresh: function() {
    this.refreshPosts();
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMorePosts();
    }
  },

  // 加载帖子列表
  loadPosts: function() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    // 模拟从数据库加载数据
    const mockPosts = this.getMockPosts();
    
    setTimeout(() => {
      this.setData({
        posts: mockPosts,
        loading: false,
        hasMore: mockPosts.length >= this.data.pageSize
      });
      wx.stopPullDownRefresh();
    }, 500);
  },

  // 刷新帖子
  refreshPosts: function() {
    this.setData({
      page: 1,
      posts: [],
      hasMore: true
    });
    this.loadPosts();
  },

  // 加载更多帖子
  loadMorePosts: function() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    // 模拟加载更多数据
    const morePosts = this.getMockPosts(this.data.page + 1);
    
    setTimeout(() => {
      this.setData({
        posts: [...this.data.posts, ...morePosts],
        page: this.data.page + 1,
        loading: false,
        hasMore: morePosts.length >= this.data.pageSize
      });
    }, 500);
  },

  // 跳转到帖子详情
  goToDetail: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: '/pages/post-detail/index?postId=' + postId
    });
  },

  // 点赞帖子
  likePost: function(e) {
    const postId = e.currentTarget.dataset.postid;
    const index = e.currentTarget.dataset.index;
    
    wx.showToast({
      title: '点赞成功',
      icon: 'success',
      duration: 1000
    });

    // 更新本地数据
    const posts = this.data.posts;
    posts[index].stats.like += 1;
    posts[index].liked = true;
    
    this.setData({ posts });
  },

  // 跳转到发布页面
  goToCreatePost: function() {
    wx.navigateTo({
      url: '/pages/post/create'
    });
  },

  // 模拟帖子数据
  getMockPosts: function(page = 1) {
    const basePosts = [
      {
        _id: 'post-' + Date.now() + '-1',
        userInfo: {
          nickName: '无障碍热心市民',
          avatarUrl: '/images/default-avatar.png'
        },
        content: '今天在社区发现一个很棒的坡道设计，分享给大家参考！坡道坡度合适，两侧有扶手，非常适合轮椅使用者。',
        images: ['/images/icon1.jpeg'],
        type: 'share',
        stats: { view: 128, like: 24, comment: 8 },
        createTime: '2024-01-08 10:30:00',
        liked: false
      },
      {
        _id: 'post-' + Date.now() + '-2',
        userInfo: {
          nickName: '视障用户小李',
          avatarUrl: '/images/default-avatar.png'
        },
        content: '求助：我们小区盲道被车辆占用严重，有什么好的解决方案吗？希望有经验的朋友分享一下。',
        images: ['/images/icon9.jpeg'],
        type: 'help',
        stats: { view: 256, like: 45, comment: 23 },
        createTime: '2024-01-07 15:20:00',
        liked: false
      },
      {
        _id: 'post-' + Date.now() + '-3',
        userInfo: {
          nickName: '无障碍随手拍用户',
          avatarUrl: '/images/default-avatar.png'
        },
        content: '自动同步：发现某商场入口台阶过高，缺少无障碍坡道，已通过随手拍功能上报相关部门。',
        images: [],
        type: 'issue',
        stats: { view: 89, like: 12, comment: 3 },
        createTime: '2024-01-07 09:15:00',
        liked: false
      }
    ];

    return basePosts.map(post => ({
      ...post,
      _id: post._id.replace('post-', 'post-' + page + '-')
    }));
  },

  // 更新帖子收藏状态（从详情页回传）
  updatePostStatus: function(postId, status) {
    const posts = this.data.posts
    const postIndex = posts.findIndex(item => item._id === postId)
    
    if (postIndex !== -1) {
      // 更新对应帖子的收藏状态
      const updatedPosts = [...posts]
      updatedPosts[postIndex] = {
        ...updatedPosts[postIndex],
        isCollected: status.isCollected,
        collectCount: status.collectCount
      }
      
      this.setData({
        posts: updatedPosts
      })
    }
  },

  // 收藏帖子（列表页直接操作）
  collectPost: function(e) {
    const postId = e.currentTarget.dataset.postid
    const index = e.currentTarget.dataset.index
    const posts = this.data.posts
    
    if (index >= 0 && index < posts.length) {
      const post = posts[index]
      const newIsCollected = !post.isCollected
      const newCollectCount = newIsCollected ? (post.collectCount || 0) + 1 : Math.max(0, (post.collectCount || 0) - 1)
      
      // 乐观更新UI
      const updatedPosts = [...posts]
      updatedPosts[index] = {
        ...updatedPosts[index],
        isCollected: newIsCollected,
        collectCount: newCollectCount
      }
      
      this.setData({
        posts: updatedPosts
      })
      
      // 跳转到详情页进行完整的收藏操作
      wx.navigateTo({
        url: `/pages/post-detail/index?postId=${postId}`
      })
    }
  }
})