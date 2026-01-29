const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    targetId: '',
    userInfo: {},
    isFollowing: false,
    currentTab: 0,
    posts: [],
    stats: {
      following: 0,
      followers: 0,
      likes: 0
    }
  },

  onLoad: function (options) {
    const targetId = options.id;
    if (!targetId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ targetId });
    this.loadUserInfo(targetId);
    this.checkFollowStatus(targetId);
    this.loadStats(targetId);
    this.loadPosts(targetId);
  },

  loadUserInfo: function (openid) {
    db.collection('users').where({
      _openid: openid
    }).get().then(res => {
      if (res.data.length > 0) {
        this.setData({ userInfo: res.data[0].userInfo });
        wx.setNavigationBarTitle({
          title: res.data[0].userInfo.nickName || '用户主页'
        });
      }
    });
  },

  checkFollowStatus: function (targetId) {
    const openid = app.globalData.openid;
    if (!openid) return;

    db.collection('follows').where({
      followerId: openid,
      targetId: targetId
    }).get().then(res => {
      this.setData({ isFollowing: res.data.length > 0 });
    });
  },

  loadStats: function (targetId) {
    // Load following count
    db.collection('follows').where({
      followerId: targetId
    }).count().then(res => {
      this.setData({ 'stats.following': res.total });
    });

    // Load followers count
    db.collection('follows').where({
      targetId: targetId
    }).count().then(res => {
      this.setData({ 'stats.followers': res.total });
    });

    // Load likes count (simplified)
    // Ideally aggregated via cloud function
  },

  loadPosts: function (targetId) {
    let query = db.collection('posts');
    
    if (this.data.currentTab === 0) {
      // User's posts
      query = query.where({ _openid: targetId });
    } else {
      // Other tabs (collections/likes) - simplified for now
      this.setData({ posts: [] });
      return;
    }

    query.orderBy('createTime', 'desc').get().then(res => {
      const posts = res.data.map(item => ({
        id: item._id,
        title: item.content,
        image: item.images && item.images.length > 0 ? item.images[0] : '/images/default-post.png',
        likes: item.stats ? item.stats.like : 0
      }));
      this.setData({ posts });
    });
  },

  onTabTap: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index }, () => {
      this.loadPosts(this.data.targetId);
    });
  },

  toggleFollow: function () {
    const targetId = this.data.targetId;
    const openid = app.globalData.openid;

    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (openid === targetId) {
      wx.showToast({ title: '不能关注自己', icon: 'none' });
      return;
    }

    if (this.data.isFollowing) {
      // Unfollow
      db.collection('follows').where({
        followerId: openid,
        targetId: targetId
      }).remove().then(() => {
        this.setData({ isFollowing: false });
        this.loadStats(targetId); // Refresh stats
      });
    } else {
      // Follow
      db.collection('follows').add({
        data: {
          followerId: openid,
          targetId: targetId,
          createTime: db.serverDate()
        }
      }).then(() => {
        this.setData({ isFollowing: true });
        this.loadStats(targetId); // Refresh stats
      });
    }
  },

  navigateToChat: function () {
    const targetId = this.data.targetId;
    const openid = app.globalData.openid;

    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (openid === targetId) {
      wx.showToast({ title: '不能私信自己', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/chat/chat?id=${targetId}`
    });
  },

  navigateToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${id}`
    });
  }
});
