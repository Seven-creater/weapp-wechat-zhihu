// 使用新登录方案的示例代码

/**
 * 示例1：在页面中检查登录状态
 */

// pages/some-page/index.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
  },

  onLoad: function() {
    this.checkAndLoadUserInfo();
  },

  onShow: function() {
    // 从登录页返回后刷新用户信息
    this.checkAndLoadUserInfo();
  },

  /**
   * 检查并加载用户信息
   */
  checkAndLoadUserInfo: function() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (userInfo && userInfo.nickName) {
      // 已有用户信息
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true,
      });
    } else {
      // 没有用户信息
      this.setData({
        hasUserInfo: false,
      });
    }
  },

  /**
   * 点击登录按钮
   */
  handleLogin: function() {
    wx.navigateTo({
      url: '/pages/login/index',
    });
  },

  /**
   * 需要登录才能执行的操作
   */
  doSomethingNeedLogin: function() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (!userInfo || !userInfo.nickName) {
      // 提示登录
      wx.showModal({
        title: '提示',
        content: '请先完善个人信息',
        confirmText: '去完善',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/index',
            });
          }
        },
      });
      return;
    }

    // 执行需要登录的操作
    console.log('执行操作，用户信息:', userInfo);
  },

  /**
   * 示例3：在发布内容时自动附加用户信息
   * 发布帖子
   */
  publishPost: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (!userInfo || !userInfo.nickName) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'none',
      });
      
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/index',
        });
      }, 1500);
      return;
    }

    const postData = {
      content: this.data.content,
      images: this.data.images,
      userInfo: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
      },
      createTime: new Date(),
    };

    // 保存帖子...
    console.log('发布帖子:', postData);
  },
});

/**
 * 示例2：在 WXML 中显示用户信息
 */

/*
<!-- pages/some-page/index.wxml -->
<view class="user-info" wx:if="{{hasUserInfo}}">
  <image class="avatar" src="{{userInfo.avatarUrl}}"></image>
  <text class="nickname">{{userInfo.nickName}}</text>
</view>

<view class="login-tip" wx:else>
  <button bindtap="handleLogin">完善个人信息</button>
</view>
*/

/**
 * 示例4：在 app.js 中统一处理登录
 */

/*
// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
  },

  onLaunch: function() {
    // 初始化云开发
    this.initCloud();
    
    // 自动登录
    this.autoLogin();
  },

  // 自动登录（恢复用户信息）
  autoLogin: function() {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo && openid) {
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      console.log('自动登录成功');
    }
  },

  // 获取 openid
  getOpenid: function() {
    return new Promise((resolve, reject) => {
      if (this.globalData.openid) {
        resolve(this.globalData.openid);
        return;
      }

      wx.cloud.callFunction({
        name: 'login',
        data: {},
      })
      .then(res => {
        if (res.result && res.result.openid) {
          this.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          resolve(res.result.openid);
        } else {
          reject(new Error('获取 openid 失败'));
        }
      })
      .catch(reject);
    });
  },

  // 检查是否需要完善信息
  checkNeedUserInfo: function() {
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo');
    return !userInfo || !userInfo.nickName;
  },

  // 引导用户完善信息
  guideToLogin: function() {
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '提示',
        content: '请先完善个人信息',
        confirmText: '去完善',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/index',
              success: () => resolve(true),
              fail: reject,
            });
          } else {
            reject(new Error('用户取消'));
          }
        },
      });
    });
  },
});
*/

/**
 * 示例5：在个人中心页面使用
 */

/*
// pages/mine/index.js
Page({
  data: {
    userInfo: null,
  },

  onShow: function() {
    this.loadUserInfo();
  },

  loadUserInfo: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (userInfo && userInfo.nickName) {
      this.setData({ userInfo });
    } else {
      // 跳转到登录页
      wx.redirectTo({
        url: '/pages/login/index',
      });
    }
  },

  // 编辑资料
  editProfile: function() {
    wx.navigateTo({
      url: '/pages/login/index', // 复用登录页面
    });
  },
});
*/

/**
 * 示例6：全局混入（可选）
 */

/*
// utils/login-mixin.js
module.exports = {
  // 检查登录状态
  checkLogin: function() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    return userInfo && userInfo.nickName;
  },

  // 要求登录
  requireLogin: function() {
    return new Promise((resolve, reject) => {
      if (this.checkLogin()) {
        resolve();
      } else {
        wx.showModal({
          title: '提示',
          content: '请先完善个人信息',
          confirmText: '去完善',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/login/index',
              });
            }
            reject(new Error('未登录'));
          },
        });
      }
    });
  },

  // 获取用户信息
  getUserInfo: function() {
    const app = getApp();
    return app.globalData.userInfo || wx.getStorageSync('userInfo');
  },
};

// 在页面中使用
const loginMixin = require('../../utils/login-mixin.js');

Page({
  ...loginMixin,

  onLoad: function() {
    this.requireLogin()
      .then(() => {
        console.log('已登录');
      })
      .catch(() => {
        console.log('未登录');
      });
  },
});
*/
