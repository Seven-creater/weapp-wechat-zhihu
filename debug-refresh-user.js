// 临时调试脚本 - 在控制台运行
// 检查并修复用户身份

const app = getApp();

// 1. 清除本地缓存
console.log('🔧 清除本地缓存...');
wx.removeStorageSync('userInfo');
app.globalData.userInfo = null;

// 2. 重新获取用户信息
const openid = app.globalData.openid || wx.getStorageSync('openid');
console.log('📱 当前 openid:', openid);

if (!openid) {
  console.error('❌ 未登录');
} else {
  // 3. 从数据库查询用户信息
  wx.cloud.callFunction({
    name: 'getUserInfo',
    data: {
      targetId: openid
    }
  }).then(res => {
    console.log('📊 数据库返回的用户信息:', res.result);
    
    if (res.result && res.result.success) {
      const userData = res.result.data;
      console.log('✅ 用户类型:', userData.userType);
      console.log('✅ 徽章信息:', userData.badge);
      console.log('✅ 补充信息:', userData.profile);
      
      // 4. 更新本地缓存
      const userInfo = {
        nickName: userData.userInfo.nickName,
        avatarUrl: userData.userInfo.avatarUrl,
        userType: userData.userType,
        badge: userData.badge,
        profile: userData.profile
      };
      
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);
      
      console.log('✅ 本地缓存已更新:', userInfo);
      console.log('🔄 请刷新页面查看效果');
      
      // 5. 刷新当前页面
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage.onShow) {
        currentPage.onShow();
      }
    } else {
      console.error('❌ 获取用户信息失败:', res.result?.error);
    }
  }).catch(err => {
    console.error('❌ 调用云函数失败:', err);
  });
}

