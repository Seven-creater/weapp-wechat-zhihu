Page({
  data: { userInfo: null },
  onShow() {
    const user = wx.getStorageSync("userInfo");
    if (user) this.setData({ userInfo: user });
  },
  handleLogin() {
    wx.getUserProfile({
      desc: "完善资料",
      success: (res) => {
        this.setData({ userInfo: res.userInfo });
        wx.setStorageSync("userInfo", res.userInfo);
      },
    });
  },
  handleNav(e) {
    const path = e.currentTarget.dataset.path; // 对应 WXML 里的 data-path
    console.log("跳转路径:", path);
    if (!this.data.userInfo) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: path,
      fail: (err) => {
        console.error("跳转失败", err);
        wx.showModal({ title: "错误", content: "找不到页面: " + path });
      },
    });
  },
  handleLogout() {
    wx.removeStorageSync("userInfo");
    this.setData({ userInfo: null });
  },
});
