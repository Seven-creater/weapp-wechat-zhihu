// 無界营造 - 应用入口文件（重构版）
// app.js

// 导入配置文件
const config = require('./config/index.js');
const createPerfProfiler = require('./utils/perf-profiler.js');
const ENABLE_UNREAD_POLLING = false;
const UNREAD_REFRESH_MIN_INTERVAL = 10 * 1000;
const UNREAD_POLLING_INTERVAL = 30 * 1000;
const ENABLE_PERF_METRICS = false;
const PERF_REPORT_FUNCTION = 'reportPerfMetrics';
const perfProfiler = createPerfProfiler({
  excludeRoutes: ['pages/test-diagnosis/index', 'pages/debug-stats/index']
});
try {
  perfProfiler.installPageHook();
} catch (err) {
  console.warn('[perf] install page hook failed:', err && err.message ? err.message : err);
}

App({
  globalData: {
    userInfo: null,
    openid: null,
    userType: null,
    hasLogin: false,
    systemInfo: null,
    perfStats: {
      callFunctionTotal: 0,
      callFunctionByName: {},
      lastUpdatedAt: 0,
    },
    unreadCount: 0,  // 🆕 未读消息数量
  },

  onLaunch: function () {
    console.log('無界营造小程序启动');
    
    this.initCloud();
    this.initPerfProfiler();
    this.patchCloudCallFunction();
    this.getSystemInfo();
    this.autoLogin();
    
    // 🆕 启动未读消息轮询
    this.startUnreadPolling();
  },

  onShow: function () {
    // 🆕 应用进入前台时刷新未读消息
    this.updateUnreadCount({ source: 'app_show' });
  },

  onHide: function () {
    this.stopUnreadPolling();
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

    const payload = {
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || ''
    };
    if (userInfo.phoneNumber) {
      payload.phoneNumber = userInfo.phoneNumber;
    }
    if (userInfo.profile) {
      payload.profile = userInfo.profile;
    }

    return wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: payload
    })
      .then(() => {
        console.log('用户资料更新成功');
      })
      .catch(err => {
        console.error('更新用户资料失败:', err);
        throw err;
      });
  },

  patchCloudCallFunction: function () {
    if (!ENABLE_PERF_METRICS) return;
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return;
    if (this._cloudCallPatched) return;

    const app = this;
    const originalCallFunction = wx.cloud.callFunction.bind(wx.cloud);
    wx.cloud.callFunction = function (options = {}) {
      const name = options && options.name ? options.name : 'unknown';
      const start = Date.now();
      app.recordPerfCall(name, {
        status: 'start',
        requestBytes: app.estimateJsonBytes(options.data || {})
      });

      return originalCallFunction(options).then((res) => {
        app.recordPerfCall(name, {
          status: 'success',
          durationMs: Date.now() - start,
          responseBytes: app.estimateJsonBytes((res && res.result) || {})
        });
        return res;
      }).catch((err) => {
        app.recordPerfCall(name, {
          status: 'error',
          durationMs: Date.now() - start
        });
        throw err;
      });
    };

    this._cloudCallPatched = true;
  },

  recordPerfCall: function (name, detail = {}) {
    if (!ENABLE_PERF_METRICS) return;
    const stats = this.globalData.perfStats || {};
    const byName = stats.callFunctionByName || {};
    const prev = byName[name] || {
      total: 0,
      success: 0,
      error: 0,
      totalDurationMs: 0,
      avgDurationMs: 0
    };

    const next = { ...prev };
    if (detail.status === 'start') {
      next.total += 1;
    } else if (detail.status === 'success') {
      next.success += 1;
      if (typeof detail.durationMs === 'number') {
        next.totalDurationMs += detail.durationMs;
        const denominator = next.success || 1;
        next.avgDurationMs = Math.round(next.totalDurationMs / denominator);
      }
    } else if (detail.status === 'error') {
      next.error += 1;
    }

    byName[name] = next;
    this.globalData.perfStats = {
      callFunctionTotal: Object.keys(byName).reduce((sum, key) => sum + (byName[key].total || 0), 0),
      callFunctionByName: byName,
      lastUpdatedAt: Date.now()
    };
  },

  estimateJsonBytes: function (value) {
    try {
      return JSON.stringify(value || {}).length;
    } catch (err) {
      return 0;
    }
  },

  initPerfProfiler: function () {
    if (this._perfProfilerInited) return;
    try {
      perfProfiler.init();
      this._perfProfilerInited = true;
      this._perfProfiler = perfProfiler;
    } catch (err) {
      console.error('[perf] init failed:', err);
    }
  },

  getPerfDeviceMeta: function () {
    const info = this.globalData.systemInfo || {};
    return {
      brand: info.brand || '',
      model: info.model || '',
      platform: info.platform || '',
      system: info.system || '',
      version: info.version || ''
    };
  },

  getMiniProgramVersion: function () {
    try {
      const accountInfo = wx.getAccountInfoSync();
      const miniProgram = accountInfo && accountInfo.miniProgram;
      return miniProgram && miniProgram.version ? miniProgram.version : 'dev';
    } catch (err) {
      return 'dev';
    }
  },

  getNetworkType: function () {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          resolve((res && res.networkType) || 'unknown');
        },
        fail: () => resolve('unknown')
      });
    });
  },

  setPerfMode: function (enabled) {
    this.initPerfProfiler();
    if (!this._perfProfiler) return false;
    return this._perfProfiler.setEnabled(!!enabled);
  },

  isPerfModeEnabled: function () {
    this.initPerfProfiler();
    return !!(this._perfProfiler && this._perfProfiler.enabled);
  },

  startPerfSession: function (meta = {}) {
    this.initPerfProfiler();
    if (!this._perfProfiler) {
      return Promise.reject(new Error('perf profiler unavailable'));
    }
    this._perfProfiler.setEnabled(true);

    return this.getNetworkType().then((networkType) => {
      return this._perfProfiler.startSession({
        runId: meta.runId || '',
        appVersion: meta.appVersion || this.getMiniProgramVersion(),
        networkType: meta.networkType || networkType || 'unknown',
        device: meta.device || this.getPerfDeviceMeta(),
        startAt: meta.startAt || Date.now()
      });
    });
  },

  stopPerfSession: function () {
    this.initPerfProfiler();
    if (!this._perfProfiler) return null;
    return this._perfProfiler.stopSession();
  },

  clearPerfSession: function () {
    this.initPerfProfiler();
    if (!this._perfProfiler) return;
    this._perfProfiler.clearSession();
  },

  getPerfUploadPayload: function () {
    this.initPerfProfiler();
    if (!this._perfProfiler) return null;
    const snapshot = this._perfProfiler.getSnapshot();
    if (!snapshot) return null;

    const routeSummaries = (snapshot.routeSummaries || []).map((item) => ({
      route: item.route,
      sampleCount: item.sampleCount || 0,
      firstScreen: {
        p50: item.firstScreen && item.firstScreen.p50 || 0,
        p95: item.firstScreen && item.firstScreen.p95 || 0,
        max: item.firstScreen && item.firstScreen.max || 0,
        timeouts: item.firstScreen && item.firstScreen.timeouts || 0
      },
      requests: {
        cloudCalls: item.requests && item.requests.cloudCalls || 0,
        dbReads: item.requests && item.requests.dbReads || 0,
        dbWrites: item.requests && item.requests.dbWrites || 0,
        total: item.requests && item.requests.total || 0
      },
      payload: {
        requestBytes: item.payload && item.payload.requestBytes || 0,
        responseBytes: item.payload && item.payload.responseBytes || 0,
        totalBytes: item.payload && item.payload.totalBytes || 0
      },
      setData: {
        count: item.setData && item.setData.count || 0,
        bytes: item.setData && item.setData.bytes || 0
      }
    }));

    return {
      runId: snapshot.runId,
      appVersion: snapshot.appVersion || this.getMiniProgramVersion(),
      networkType: snapshot.networkType || 'unknown',
      device: snapshot.device || this.getPerfDeviceMeta(),
      routeSummaries
    };
  },

  uploadPerfSummary: function () {
    const payload = this.getPerfUploadPayload();
    if (!payload) {
      return Promise.reject(new Error('no perf session'));
    }
    if (!Array.isArray(payload.routeSummaries) || payload.routeSummaries.length === 0) {
      return Promise.reject(new Error('no route summaries'));
    }

    return wx.cloud.callFunction({
      name: PERF_REPORT_FUNCTION,
      data: payload
    }).then((res) => {
      if (res && res.result && res.result.success) {
        return res.result;
      }
      throw new Error((res && res.result && res.result.error) || 'upload failed');
    });
  },

  exportPerfReport: function () {
    this.initPerfProfiler();
    if (!this._perfProfiler) return null;
    return this._perfProfiler.exportReport();
  },

  getPerfSnapshot: function () {
    this.initPerfProfiler();
    if (this._perfProfiler) {
      const snapshot = this._perfProfiler.getSnapshot();
      if (snapshot) {
        return snapshot;
      }
    }
    return this.globalData.perfStats || {
      callFunctionTotal: 0,
      callFunctionByName: {},
      lastUpdatedAt: 0
    };
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
  _legacyStartUnreadPolling: function () {
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
  _legacyUpdateUnreadCount: function () {
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
  // 覆盖旧实现：统一未读数来源 + 节流 + 去重
  startUnreadPolling: function () {
    this.updateUnreadCount({ force: true, source: 'launch' });
    if (!ENABLE_UNREAD_POLLING) return;

    this.stopUnreadPolling();
    this.unreadPollingTimer = setInterval(() => {
      this.updateUnreadCount({ source: 'polling' });
    }, UNREAD_POLLING_INTERVAL);
  },

  stopUnreadPolling: function () {
    if (this.unreadPollingTimer) {
      clearInterval(this.unreadPollingTimer);
      this.unreadPollingTimer = null;
    }
  },

  // 覆盖旧实现：防并发、防抖动、仅变化时广播
  updateUnreadCount: function (options = {}) {
    const force = !!options.force;
    const openid = this.getOpenid();
    if (!openid) {
      return Promise.resolve(0);
    }

    const now = Date.now();
    this.lastUnreadRefreshAt = this.lastUnreadRefreshAt || 0;
    if (!force && now - this.lastUnreadRefreshAt < UNREAD_REFRESH_MIN_INTERVAL) {
      return Promise.resolve(this.globalData.unreadCount || 0);
    }
    if (this.unreadCountInflight) {
      return this.unreadCountInflight;
    }
    this.lastUnreadRefreshAt = now;

    this.unreadCountInflight = this.sumUnreadCountByOwner(openid)
      .then((totalUnread) => {

        if (totalUnread !== this.globalData.unreadCount) {
          this.globalData.unreadCount = totalUnread;
          this.updateTabBarBadge(totalUnread);
          this.notifyUnreadCountChange(totalUnread);
        } else {
          this.updateTabBarBadge(totalUnread);
        }
        return totalUnread;
      })
      .catch((err) => {
        console.error('鏇存柊鏈娑堟伅鏁伴噺澶辫触:', err);
        return this.globalData.unreadCount || 0;
      })
      .finally(() => {
        this.unreadCountInflight = null;
      });

    return this.unreadCountInflight;
  },

  sumUnreadCountByOwner: function (openid) {
    const db = wx.cloud.database();
    const PAGE_SIZE = 100;
    const MAX_SCAN_ROWS = 1000;

    const fetchPage = (skip, acc) => {
      if (skip >= MAX_SCAN_ROWS) {
        return Promise.resolve(acc);
      }
      return db.collection('conversations')
        .where({ ownerId: openid })
        .field({ unreadCount: true })
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()
        .then((res) => {
          const rows = Array.isArray(res.data) ? res.data : [];
          const nextAcc = rows.reduce((sum, conv) => sum + (conv.unreadCount || 0), acc);
          if (rows.length < PAGE_SIZE) {
            return nextAcc;
          }
          return fetchPage(skip + PAGE_SIZE, nextAcc);
        });
    };

    return fetchPage(0, 0);
  },

  getUnreadCount: function () {
    return this.globalData.unreadCount || 0;
  },
});
