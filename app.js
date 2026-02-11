// 無界营造 - 应用入口文件（重构版）
// app.js

// 导入配置文件
const config = require('./config/index.js');

App({
  globalData: {
    userInfo: null,
    openid: null,
    userType: null,
    hasLogin: false,
    systemInfo: null,
    unreadCount: 0,  // 🆕 未读消息数量
  },

  onLaunch: function () {
    console.log('無界营造小程序启动');
    
    this.initCloud();
    this.getSystemInfo();
    this.autoLogin();
    
    // 🆕 启动未读消息轮询
    this.startUnreadPolling();
  },

  onShow: function () {
    // 🆕 应用进入前台时刷新未读消息
    this.updateUnreadCount();
  },

  initCloud: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    
    wx.cloud.init({
      env: config.CLOUD_ENV,
      traceUser: true,
    });
    
    console.log('云开发环境初始化成功:', config.CLOUD_ENV);
  },

  getSystemInfo: function () {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      console.log('系统信息:', systemInfo);
    } catch (err) {
      console.error('获取系统信息失败:', err);
    }
  },

  /**
   * ✅ 自动登录（从本地存储恢复）
   */
  autoLogin: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    const userType = wx.getStorageSync('userType');
    
    // ✅ 必须同时存在 openid 和 userInfo 才能自动登录
    if (openid && userInfo) {
      if (!userInfo.avatarUrl || userInfo.avatarUrl.trim() === '') {
        userInfo.avatarUrl = '/images/zhi.png';
      }
      
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.userType = userType || 'CommunityWorker';
      this.globalData.hasLogin = true;
      console.log('✅ 自动登录成功, openid:', openid, 'userType:', this.globalData.userType);
      
      this.refreshUserInfo(openid);
    } else {
      // ✅ 如果缺少任何一个，清除所有登录数据
      console.log('⚠️ 登录数据不完整（openid:', !!openid, 'userInfo:', !!userInfo, '），清除缓存');
      wx.removeStorageSync('openid');
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('userType');
      this.globalData.openid = null;
      this.globalData.userInfo = null;
      this.globalData.userType = null;
      this.globalData.hasLogin = false;
    }
  },

  refreshUserInfo: function (openid) {
    if (!openid) return;
    
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid
      }
    }).then(res => {
      if (res.result && res.result.success && res.result.data) {
        const userData = res.result.data;
        const userInfo = userData.userInfo || {};
        
        let avatarUrl = userInfo.avatarUrl;
        if (!avatarUrl || avatarUrl.trim() === '') {
          avatarUrl = '/images/zhi.png';
          console.warn('⚠️ 数据库中的头像URL为空，使用默认头像');
        }
        
        const fullUserInfo = {
          nickName: userInfo.nickName || '無界用户',
          avatarUrl: avatarUrl,
        };
        
        const userType = userData.userType || 'CommunityWorker';
        
        this.globalData.userInfo = fullUserInfo;
        this.globalData.userType = userType;
        wx.setStorageSync('userInfo', fullUserInfo);
        wx.setStorageSync('userType', userType);
        
        console.log('✅ 用户信息已从数据库刷新, userType:', userType);
      }
    }).catch(err => {
      console.error('❌ 刷新用户信息失败:', err);
      const currentUserInfo = this.globalData.userInfo;
      if (currentUserInfo && (!currentUserInfo.avatarUrl || currentUserInfo.avatarUrl.trim() === '')) {
        currentUserInfo.avatarUrl = '/images/zhi.png';
        this.globalData.userInfo = currentUserInfo;
        wx.setStorageSync('userInfo', currentUserInfo);
      }
    });
  },

  login: function () {
    const { showLoading, hideLoading, showError } = require('./utils/common.js');
    
    return new Promise((resolve, reject) => {
      showLoading('登录中...');
      
      wx.cloud.callFunction({
        name: 'login',
        data: {},
      })
      .then(res => {
        if (res.result && res.result.openid) {
          this.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          
          return this.getUserProfile();
        } else {
          throw new Error('登录失败，未获取到 openid');
        }
      })
      .then(() => {
        hideLoading();
        this.globalData.hasLogin = true;
        resolve();
      })
      .catch(err => {
        hideLoading();
        console.error('登录失败:', err);
        showError(err.message || '登录失败');
        reject(err);
      });
    });
  },

  getUserProfile: function () {
    return new Promise((resolve, reject) => {
      const savedUserInfo = wx.getStorageSync('userInfo');
      if (savedUserInfo) {
        this.globalData.userInfo = savedUserInfo;
        resolve(savedUserInfo);
        return;
      }
      
      reject(new Error('需要用户授权'));
    });
  },

  checkLogin: function () {
    return new Promise((resolve, reject) => {
      if (this.globalData.hasLogin && this.globalData.openid) {
        resolve();
      } else {
        reject(new Error('未登录'));
      }
    });
  },

  logout: function () {
    this.globalData.userInfo = null;
    this.globalData.openid = null;
    this.globalData.userType = null;
    this.globalData.hasLogin = false;
    
    wx.removeStorageSync('openid');
    
    console.log('退出登录成功');
  },

  updateUserInfo: function (userInfo) {
    if (!userInfo) return;
    
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
    console.log('用户信息已更新');
  },

  ensureOpenid: function () {
    return new Promise((resolve, reject) => {
      if (this.globalData.openid) {
        resolve(this.globalData.openid);
        return;
      }
      
      const openid = wx.getStorageSync('openid');
      if (openid) {
        this.globalData.openid = openid;
        resolve(openid);
        return;
      }
      
      this.login()
        .then(() => resolve(this.globalData.openid))
        .catch(reject);
    });
  },

  applyUserState: function (userInfo, openid) {
    if (!userInfo) return null;
    
    if (!userInfo.avatarUrl || userInfo.avatarUrl.trim() === '') {
      userInfo.avatarUrl = '/images/zhi.png';
    }
    
    this.globalData.userInfo = userInfo;
    this.globalData.openid = openid;
    
    wx.setStorageSync('userInfo', userInfo);
    wx.setStorageSync('openid', openid);
    
    return userInfo;
  },

  uploadFile: function (options) {
    const { filePath, dir = 'uploads' } = options;
    
    return new Promise((resolve, reject) => {
      if (!filePath) {
        reject(new Error('文件路径不能为空'));
        return;
      }
      
      const ext = filePath.split('.').pop();
      const cloudPath = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
      })
      .then(res => {
        console.log('文件上传成功:', res.fileID);
        resolve(res.fileID);
      })
      .catch(err => {
        console.error('上传文件失败:', err);
        reject(err);
      });
    });
  },

  uploadFiles: function (filePaths, prefix = 'uploads') {
    const uploads = filePaths.map((filePath) => {
      return this.uploadFile({ filePath, dir: prefix });
    });
    
    return Promise.all(uploads);
  },

  upsertUserProfile: function (openid, userInfo) {
    if (!userInfo || !openid) {
      return Promise.reject(new Error('缺少必要参数'));
    }
    
    console.log('📝 更新用户资料:', { openid, userInfo });
    
    const db = wx.cloud.database();
    return db.collection('users')
      .where({ _openid: openid })
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          console.log('✅ 更新现有用户资料，保留 userType:', res.data[0].userType);
          return db.collection('users')
            .doc(res.data[0]._id)
            .update({
              data: {
                userInfo: userInfo,
                updateTime: db.serverDate(),
              }
            });
        } else {
          console.log('✅ 创建新用户，默认 userType: CommunityWorker');
          return db.collection('users').add({
            data: {
              userInfo: userInfo,
              userType: 'CommunityWorker',
              createTime: db.serverDate(),
              updateTime: db.serverDate(),
            }
          });
        }
      })
      .then(() => {
        console.log('✅ 用户资料更新成功');
      })
      .catch(err => {
        console.error('❌ 更新用户资料失败:', err);
        throw err;
      });
  },

  callFunction: function (name, data = {}) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: name,
        data: data,
      })
      .then(res => {
        if (res.result && res.result.success !== false) {
          resolve(res.result);
        } else {
          reject(new Error(res.result?.error || '调用失败'));
        }
      })
      .catch(err => {
        console.error(`云函数 ${name} 调用失败:`, err);
        reject(err);
      });
    });
  },

  checkContentSafe: function (type, value) {
    return this.callFunction('checkContent', { type, value })
      .then(res => {
        if (res.code === 0) {
          return true;
        } else {
          throw new Error('内容包含敏感信息');
        }
      });
  },

  getLocation: function () {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject,
      });
    });
  },

  chooseLocation: function () {
    return new Promise((resolve, reject) => {
      wx.chooseLocation({
        success: resolve,
        fail: reject,
      });
    });
  },

  getOpenid: function () {
    return this.globalData.openid || wx.getStorageSync('openid') || null;
  },

  getCurrentUserInfo: function () {
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (userInfo && (!userInfo.avatarUrl || userInfo.avatarUrl.trim() === '')) {
      userInfo.avatarUrl = '/images/zhi.png';
    }
    
    return userInfo;
  },

  getUserType: function () {
    return this.globalData.userType || wx.getStorageSync('userType') || 'CommunityWorker';
  },

  isCurrentUser: function (targetOpenid) {
    const currentOpenid = this.getOpenid();
    return currentOpenid && currentOpenid === targetOpenid;
  },

  /**
   * 🆕 启动未读消息轮询
   */
  startUnreadPolling: function () {
    // 立即执行一次
    this.updateUnreadCount();
    
    // 每30秒轮询一次
    this.unreadPollingTimer = setInterval(() => {
      this.updateUnreadCount();
    }, 30000);
  },

  /**
   * 🆕 更新未读消息数量
   */
  updateUnreadCount: function () {
    const openid = this.getOpenid();
    if (!openid) {
      return;
    }

    wx.cloud.database().collection('conversations')
      .where({
        ownerId: openid
      })
      .field({
        unreadCount: true
      })
      .get()
      .then(res => {
        const conversations = res.data || [];
        const totalUnread = conversations.reduce((sum, conv) => {
          return sum + (conv.unreadCount || 0);
        }, 0);
        
        console.log('📊 全局未读消息统计:', totalUnread, '条');
        
        // 更新全局数据
        this.globalData.unreadCount = totalUnread;
        
        // 更新 TabBar 角标
        this.updateTabBarBadge(totalUnread);
        
        // 通知所有页面更新
        this.notifyUnreadCountChange(totalUnread);
      })
      .catch(err => {
        console.error('更新未读消息数量失败:', err);
      });
  },

  /**
   * 🆕 更新 TabBar 角标
   */
  updateTabBarBadge: function (count) {
    if (count > 0) {
      wx.setTabBarBadge({
        index: 3,  // 消息是第4个tab（索引为3）
        text: count > 99 ? '99+' : String(count)
      });
    } else {
      wx.removeTabBarBadge({
        index: 3
      });
    }
  },

  /**
   * 🆕 通知所有页面未读消息数量变化
   */
  notifyUnreadCountChange: function (count) {
    const pages = getCurrentPages();
    pages.forEach(page => {
      // 更新自定义 TabBar
      if (typeof page.getTabBar === 'function') {
        const tabBar = page.getTabBar();
        if (tabBar && typeof tabBar.updateUnreadCount === 'function') {
          tabBar.updateUnreadCount(count);
        }
      }
      
      // 如果是消息页面，触发刷新
      if (page.route === 'pages/notify/notify' && typeof page.updateUnreadBadge === 'function') {
        page.updateUnreadBadge();
      }
    });
  },

  /**
   * 🆕 获取未读消息数量
   */
  getUnreadCount: function () {
    return this.globalData.unreadCount || 0;
  },
});
