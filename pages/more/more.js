// more.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    stats: { collect: 0, comment: 0, like: 0 }
  },
  
  onLoad: function() {
    this.checkLoginStatus();
  },
  
  onShow: function() {
    this.checkLoginStatus();
  },
  
  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },
  
  // 登录函数
  handleLogin: function() {
    const that = this;
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        const userInfo = res.userInfo;
        that.setData({ userInfo });
        wx.setStorageSync('userInfo', userInfo);
      },
      fail: (err) => {
        console.error('登录失败:', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },
  
  // 统一跳转处理
  handleNav: function(e) {
    const path = e.currentTarget.dataset.path;
    
    // 第二步：如果路径为空或未定义，提示“功能开发中”
    if (!path) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      return;
    }
    
    // 第三步：权限拦截
    const protectedPaths = ['/pages/my-favorites/index', '/pages/my-comments/index'];
    if (protectedPaths.includes(path) && !this.data.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    
    // 第四步：执行跳转
    wx.navigateTo({
      url: path,
      fail: (err) => {
        console.error('跳转失败:', err);
        if (err.errMsg && err.errMsg.includes('page not found')) {
          console.error('请检查app.json中是否已添加页面路径:', path);
          wx.showToast({ title: '页面未找到', icon: 'none' });
        }
      }
    });
  }
})