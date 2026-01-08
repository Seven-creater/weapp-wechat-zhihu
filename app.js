//app.js
App({
  onLaunch: function () {
    // 初始化云开发环境
    wx.cloud.init({
      env: "YOUR_CLOUD_ENV_ID", // 请将此处替换为您的真实云开发环境ID
      traceUser: true, // 开启用户访问记录
    });
  },
  globalData: {
    userInfo: null,
  },
});
