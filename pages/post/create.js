// pages/post/create.js
Page({
  data: {},

  onLoad: function (options) {},

  onCommunityTap: function() {
    wx.navigateTo({
      url: '/pages/post/new-post/index'
    });
  },

  onIssueTap: function() {
    wx.navigateTo({
      url: '/pages/issue-edit/index'
    });
  }
});
