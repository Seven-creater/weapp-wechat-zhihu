Page({
  data: { userInfo: null },

  onShow() {
    // 每次进入页面，检查缓存中的登录态
    const user = wx.getStorageSync("userInfo");
    if (user) {
      this.setData({ userInfo: user });
    }
  },

  // 1. 登录
  handleLogin() {
    wx.getUserProfile({
      desc: "同步个人数据",
      success: (res) => {
        this.setData({ userInfo: res.userInfo });
        wx.setStorageSync("userInfo", res.userInfo);
        wx.showToast({ title: "欢迎回来" });
      },
    });
  },

  // 2. 跳转导航
  handleNav(e) {
    const path = e.currentTarget.dataset.path;
    console.log("点击跳转:", path);

    // 拦截未登录
    if (!this.data.userInfo) {
      return wx.showToast({ title: "请先登录", icon: "none" });
    }

    // 执行跳转
    wx.navigateTo({
      url: path,
      fail: (err) => {
        console.error("跳转失败", err);
        wx.showModal({
          title: "配置错误",
          content: "请在 app.json 中注册页面: " + path,
          showCancel: false,
        });
      },
    });
  },

  // 3. 退出
  handleLogout() {
    wx.removeStorageSync("userInfo");
    this.setData({ userInfo: null });
  },
});
