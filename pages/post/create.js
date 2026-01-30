// pages/post/create.js
const app = getApp();

Page({
  data: {},

  onLoad: function (options) {},

  onShow: function () {
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (!openid || !userInfo) {
      // 未登录，清除登录状态
      app.globalData.hasLogin = false;
    } else {
      app.globalData.hasLogin = true;
    }
  },

  /**
   * 发布社区帖子
   */
  onCommunityTap: function() {
    // 检查登录状态
    if (!this.isLoggedIn()) {
      this.showLoginPrompt('发布帖子');
      return;
    }

    wx.navigateTo({
      url: '/pages/post/new-post/index'
    });
  },

  /**
   * 发布无障碍问题
   */
  onIssueTap: function() {
    // 检查登录状态
    if (!this.isLoggedIn()) {
      this.showLoginPrompt('发布问题');
      return;
    }

    wx.navigateTo({
      url: '/pages/issue-edit/index'
    });
  },

  /**
   * 检查是否已登录
   */
  isLoggedIn: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    return !!(openid && userInfo);
  },

  /**
   * 显示登录提示
   */
  showLoginPrompt: function (action) {
    wx.showModal({
      title: '需要登录',
      content: `${action}前需要先登录，是否前往登录？`,
      confirmText: '去登录',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/login/index'
          });
        }
      }
    });
  },
});
