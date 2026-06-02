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

  onLoad() {
    this.loadNotifications(true);
  },

  onPullDownRefresh() {
    this.loadNotifications(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadNotifications(false);
    }
  },

  loadNotifications(refresh) {
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

    return wx.cloud.callFunction({
      name: 'getNotificationFeed',
      data: {
        type: 'comment',
        page: nextPage,
        pageSize: this.data.pageSize
      }
    }).then((res) => {
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || 'load failed');
      }
      const rows = (res.result.data || []).map((item) => ({
        ...item,
        time: this.formatTime(item.createTime)
      }));

      this.setData({
        notifications: refresh ? rows : (this.data.notifications || []).concat(rows),
        loading: false,
        hasMore: !!(res.result.pagination && res.result.pagination.hasMore),
        page: nextPage
      });
    }).catch((err) => {
      console.error('load comment notifications failed:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  formatTime(date) {
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
    }
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  },

  onUserTap(e) {
    const userId = e.currentTarget.dataset.userid;
    if (userId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${userId}`
      });
    }
  },

  onPostTap(e) {
    const postId = e.currentTarget.dataset.postid;
    if (postId) {
      wx.navigateTo({
        url: `/pages/post-detail/index?id=${postId}`
      });
    }
  }
});
