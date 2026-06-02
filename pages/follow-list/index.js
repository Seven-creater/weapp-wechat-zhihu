// pages/follow-list/index.js
const app = getApp();
const followUtil = require('../../utils/follow.js');

Page({
  data: {
    type: 'following',
    users: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad(options) {
    const type = options.type || 'following';
    this.setData({ type });
    wx.setNavigationBarTitle({
      title: type === 'followers' ? '粉丝' : '关注'
    });
    this.loadData(true);
  },

  onShow() {
    // no-op: onLoad 已加载；避免重复请求
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadData(true)).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadData(false);
    }
  },

  loadData(refresh = false) {
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

    const fetcher = this.data.type === 'following'
      ? followUtil.getFollowingList
      : followUtil.getFollowersList;

    return fetcher({
      userId: openid,
      page: nextPage,
      pageSize: this.data.pageSize,
      includeProfile: true,
      returnMeta: true
    }).then((res) => {
      const rows = Array.isArray(res.data) ? res.data : [];
      const users = rows.map((item) => {
        const userId = this.data.type === 'following' ? item.targetId : item._openid;
        const userInfo = item.userInfo || { nickName: '未知用户', avatarUrl: '/images/zhi.png' };
        return {
          userId,
          userInfo,
          userType: item.userType || 'normal',
          isFollowing: !!item.isFollowing,
          isMutual: !!item.isMutual,
          isSelf: userId === openid,
          createTime: item.createTime
        };
      });

      this.setData({
        users: refresh ? users : (this.data.users || []).concat(users),
        page: nextPage,
        hasMore: !!(res.pagination && res.pagination.hasMore),
        loading: false
      });
    }).catch((err) => {
      console.error('load follow list failed:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none',
        duration: 3000
      });
    });
  },

  navigateToProfile(e) {
    const userId = e.currentTarget.dataset.id;
    const openid = app.globalData.openid || wx.getStorageSync('openid');

    if (!userId) {
      wx.showToast({ title: '用户ID错误', icon: 'none' });
      return;
    }
    if (userId === openid) {
      wx.switchTab({ url: '/pages/mine/index' });
      return;
    }
    wx.navigateTo({
      url: `/pages/user-profile/index?id=${userId}`
    });
  },

  toggleFollow(e) {
    const index = Number(e.currentTarget.dataset.index);
    const user = this.data.users[index];
    if (!user || user.isSelf) return;

    wx.showLoading({ title: '处理中...' });
    const promise = user.isFollowing
      ? followUtil.unfollowUser(user.userId)
      : followUtil.followUser(user.userId);

    promise.then(() => {
      wx.hideLoading();
      wx.showToast({
        title: user.isFollowing ? '已取消关注' : '关注成功',
        icon: 'success'
      });

      const users = this.data.users.slice();
      const nextFollowing = !user.isFollowing;
      users[index] = {
        ...users[index],
        isFollowing: nextFollowing,
        isMutual: this.data.type === 'followers'
          ? nextFollowing
          : users[index].isMutual
      };
      this.setData({ users });
    }).catch((err) => {
      wx.hideLoading();
      console.error('follow action failed:', err);
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      });
    });
  }
});
