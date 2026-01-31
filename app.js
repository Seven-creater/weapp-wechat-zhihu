// 無界营造 - 应用入口文件（重构版）
// app.js

// 导入配置文件
const config = require('./config/index.js');

App({
  globalData: {
    userInfo: null,
    openid: null,
    hasLogin: false,
    systemInfo: null,
  },

  /**
   * 小程序初始化
   */
  onLaunch: function () {
    console.log('無界营造小程序启动');
    
    // 初始化云开发（必须在最前面）
    this.initCloud();
    
    // 获取系统信息
    this.getSystemInfo();
    
    // 尝试自动登录
    this.autoLogin();
  },

  /**
   * 初始化云开发环境
   */
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

  /**
   * 获取系统信息
   */
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
   * 自动登录（从本地存储恢复）
   */
  autoLogin: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo && openid) {
      // 🔧 确保头像URL有效
      if (!userInfo.avatarUrl || userInfo.avatarUrl.trim() === '') {
        userInfo.avatarUrl = '/images/zhi.png';
      }
      
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.hasLogin = true;
      console.log('✅ 自动登录成功');
      
      // 🆕 从数据库重新加载用户信息（异步，不阻塞启动）
      this.refreshUserInfo(openid);
    }
  },

  /**
   * 🆕 从数据库刷新用户信息
   */
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
        
        // 🔧 确保头像URL有效
        let avatarUrl = userInfo.avatarUrl;
        if (!avatarUrl || avatarUrl.trim() === '') {
          avatarUrl = '/images/zhi.png';
          console.warn('⚠️ 数据库中的头像URL为空，使用默认头像');
        }
        
        const fullUserInfo = {
          nickName: userInfo.nickName || '無界用户',
          avatarUrl: avatarUrl,
          userType: userData.userType || 'normal',
          badge: userData.badge || null,
          profile: userData.profile || {}
        };
        
        // 更新全局和本地缓存
        this.globalData.userInfo = fullUserInfo;
        wx.setStorageSync('userInfo', fullUserInfo);
        
        console.log('✅ 用户信息已从数据库刷新');
      }
    }).catch(err => {
      console.error('❌ 刷新用户信息失败:', err);
      // 失败时确保使用默认头像
      const currentUserInfo = this.globalData.userInfo;
      if (currentUserInfo && (!currentUserInfo.avatarUrl || currentUserInfo.avatarUrl.trim() === '')) {
        currentUserInfo.avatarUrl = '/images/zhi.png';
        this.globalData.userInfo = currentUserInfo;
        wx.setStorageSync('userInfo', currentUserInfo);
      }
    });
  },

  /**
   * 用户登录
   * @returns {Promise}
   */
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
          
          // 获取用户信息
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

  /**
   * 获取用户信息（微信官方推荐方式）
   * @returns {Promise}
   */
  getUserProfile: function () {
    return new Promise((resolve, reject) => {
      // 先尝试从本地存储获取
      const savedUserInfo = wx.getStorageSync('userInfo');
      if (savedUserInfo) {
        this.globalData.userInfo = savedUserInfo;
        resolve(savedUserInfo);
        return;
      }
      
      // 如果没有，则需要用户手动授权
      // 注意：这里不自动弹出授权，由页面调用
      reject(new Error('需要用户授权'));
    });
  },

  /**
   * 检查登录状态
   * @returns {Promise}
   */
  checkLogin: function () {
    return new Promise((resolve, reject) => {
      if (this.globalData.hasLogin && this.globalData.openid) {
        resolve();
      } else {
        reject(new Error('未登录'));
      }
    });
  },

  /**
   * 退出登录
   */
  logout: function () {
    this.globalData.userInfo = null;
    this.globalData.openid = null;
    this.globalData.hasLogin = false;
    
    // 清除本地存储（但保留用户信息，以便下次登录恢复）
    // wx.removeStorageSync('userInfo');
    wx.removeStorageSync('openid');
    
    console.log('退出登录成功');
  },

  /**
   * 更新用户信息
   * @param {Object} userInfo - 用户信息
   */
  updateUserInfo: function (userInfo) {
    if (!userInfo) return;
    
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
    console.log('用户信息已更新');
  },

  /**
   * 确保有 openid
   * @returns {Promise<string>}
   */
  ensureOpenid: function () {
    return new Promise((resolve, reject) => {
      if (this.globalData.openid) {
        resolve(this.globalData.openid);
        return;
      }
      
      this.login()
        .then(() => resolve(this.globalData.openid))
        .catch(reject);
    });
  },

  /**
   * 应用用户状态（用于页面恢复）
   * @param {Object} page - 页面实例
   */
  applyUserState: function (page) {
    if (!page) return;
    
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo && page.setData) {
      page.setData({
        userInfo: userInfo,
        hasUserInfo: true,
      });
    }
  },

  /**
   * 上传文件到云存储
   * @param {string} filePath - 本地文件路径
   * @param {string} cloudPath - 云存储路径
   * @returns {Promise<string>} - 返回文件 ID
   */
  uploadFile: function (filePath, cloudPath) {
    const { showLoading, hideLoading, showError } = require('./utils/common.js');
    
    return new Promise((resolve, reject) => {
      showLoading('上传中...');
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
      })
      .then(res => {
        hideLoading();
        resolve(res.fileID);
      })
      .catch(err => {
        hideLoading();
        console.error('上传文件失败:', err);
        showError('上传失败');
        reject(err);
      });
    });
  },

  /**
   * 批量上传文件
   * @param {Array<string>} filePaths - 本地文件路径数组
   * @param {string} prefix - 云存储路径前缀
   * @returns {Promise<Array<string>>} - 返回文件 ID 数组
   */
  uploadFiles: function (filePaths, prefix = 'uploads') {
    const uploads = filePaths.map((filePath, index) => {
      const ext = filePath.split('.').pop();
      const cloudPath = `${prefix}/${Date.now()}-${index}.${ext}`;
      return this.uploadFile(filePath, cloudPath);
    });
    
    return Promise.all(uploads);
  },

  /**
   * 更新用户资料到数据库
   * @param {Object} userInfo - 用户信息
   * @returns {Promise}
   */
  upsertUserProfile: function (userInfo) {
    if (!userInfo || !this.globalData.openid) {
      return Promise.reject(new Error('缺少必要参数'));
    }
    
    const db = wx.cloud.database();
    return db.collection('users')
      .where({ _openid: this.globalData.openid })
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          // 更新
          return db.collection('users')
            .doc(res.data[0]._id)
            .update({
              data: {
                userInfo: userInfo,
                updateTime: db.serverDate(),
              }
            });
        } else {
          // 新增
          return db.collection('users').add({
            data: {
              userInfo: userInfo,
              createTime: db.serverDate(),
              updateTime: db.serverDate(),
            }
          });
        }
      });
  },

  /**
   * 调用云函数
   * @param {string} name - 云函数名称
   * @param {Object} data - 参数
   * @returns {Promise}
   */
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

  /**
   * 内容安全检测
   * @param {string} type - 类型（text/image）
   * @param {string} value - 内容
   * @returns {Promise<boolean>}
   */
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

  /**
   * 获取位置信息
   * @returns {Promise<Object>}
   */
  getLocation: function () {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject,
      });
    });
  },

  /**
   * 选择位置
   * @returns {Promise<Object>}
   */
  chooseLocation: function () {
    return new Promise((resolve, reject) => {
      wx.chooseLocation({
        success: resolve,
        fail: reject,
      });
    });
  },
});
