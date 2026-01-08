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
  
  // 现代化登录函数
  handleLogin: function() {
    const that = this;
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        const userInfo = res.userInfo;
        that.setData({ userInfo });
        wx.setStorageSync('userInfo', userInfo);
        wx.showToast({ title: '登录成功', icon: 'success' });
      },
      fail: (err) => {
        console.error('登录失败:', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },
  
  // 通用跳转路由
  handleNav: function(e) {
    console.log('点击了菜单', e.currentTarget.dataset);
    const url = e.currentTarget.dataset.url;
    
    // 处理退出登录
    if (url === 'logout') {
      this.handleLogout();
      return;
    }
    
    // 路径为空或未定义，提示“功能开发中”
    if (!url) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      return;
    }
    
    // 权限拦截：检查是否是需要登录的页面
    const protectedUrls = ['/pages/my-favorites/index', '/pages/my-comments/index'];
    if (protectedUrls.includes(url) && !this.data.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    
    // 执行跳转
    wx.navigateTo({
      url: url,
      success: () => {
        console.log('跳转成功:', url);
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        if (err.errMsg && err.errMsg.includes('page not found')) {
          console.error('请检查app.json中是否已添加页面路径:', url);
          wx.showToast({ title: '页面未找到', icon: 'none' });
        } else if (err.errMsg && err.errMsg.includes('navigateTo:fail can not navigateTo a tabbar page')) {
          // 如果是tabbar页面，使用switchTab
          wx.switchTab({
            url: url,
            fail: (switchErr) => {
              console.error('switchTab失败:', switchErr);
              wx.showToast({ title: '跳转失败', icon: 'none' });
            }
          });
        } else {
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
      }
    });
  },
  
  // 退出登录
  handleLogout: function() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清空本地存储
          wx.removeStorageSync('userInfo');
          
          // 更新页面状态
          this.setData({ userInfo: null });
          
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  }
})