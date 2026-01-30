// pages/login/index.js
const app = getApp();

Page({
  data: {
    avatarUrl: '/images/zhi.png', // 默认头像
    nickName: '',
    phoneNumber: '', // 手机号（必填）
    canSubmit: false,
  },

  onLoad: function (options) {
    // 检查是否已有用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo && userInfo.nickName) {
      this.setData({
        avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
        nickName: userInfo.nickName,
        phoneNumber: userInfo.phoneNumber || '',
      }, () => {
        this.checkCanSubmit();
      });
    }
  },

  /**
   * 选择头像（微信官方推荐方式）
   */
  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail;
    console.log('选择头像:', avatarUrl);
    
    this.setData({
      avatarUrl: avatarUrl,
    }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 昵称输入（微信官方推荐方式）
   */
  onNicknameInput: function (e) {
    const nickName = e.detail.value;
    console.log('输入昵称:', nickName);
    
    this.setData({
      nickName: nickName,
    }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 手机号输入
   */
  onPhoneInput: function (e) {
    let phoneNumber = e.detail.value;
    // 只允许输入数字
    phoneNumber = phoneNumber.replace(/[^\d]/g, '');
    // 限制11位
    if (phoneNumber.length > 11) {
      phoneNumber = phoneNumber.slice(0, 11);
    }
    
    this.setData({
      phoneNumber: phoneNumber,
    }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 检查是否可以提交
   */
  checkCanSubmit: function () {
    const { avatarUrl, nickName, phoneNumber } = this.data;
    // 必须有头像、昵称和11位手机号
    const canSubmit = avatarUrl && 
                      nickName && nickName.trim().length > 0 && 
                      phoneNumber && phoneNumber.length === 11;
    this.setData({ canSubmit });
  },

  /**
   * 提交用户信息
   */
  submitUserInfo: function () {
    const { avatarUrl, nickName, phoneNumber } = this.data;

    // 验证手机号
    if (!phoneNumber || phoneNumber.length !== 11) {
      wx.showToast({
        title: '请输入11位手机号',
        icon: 'none',
      });
      return;
    }

    // 验证手机号格式（1开头，第二位是3-9）
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(phoneNumber)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none',
      });
      return;
    }

    if (!this.data.canSubmit) {
      wx.showToast({
        title: '请完善信息',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({
      title: '登录中...',
      mask: true,
    });

    // 1. 先获取 openid（登录）
    this.getOpenid()
      .then(() => {
        wx.showLoading({ title: '上传头像...', mask: true });
        // 2. 上传头像到云存储
        return this.uploadAvatar(avatarUrl);
      })
      .then((cloudAvatarUrl) => {
        wx.showLoading({ title: '保存信息...', mask: true });
        // 3. 保存用户信息到数据库
        return this.saveUserInfo({
          nickName: nickName.trim(),
          avatarUrl: cloudAvatarUrl,
          phoneNumber: phoneNumber,
        });
      })
      .then((userInfo) => {
        wx.hideLoading();
        
        // 4. 更新全局状态（注意：不在本地存储手机号，保护隐私）
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          // 不存储 phoneNumber 到本地
        };
        
        app.globalData.userInfo = publicUserInfo;
        app.globalData.hasLogin = true;
        wx.setStorageSync('userInfo', publicUserInfo);
        
        wx.showToast({
          title: '登录成功',
          icon: 'success',
        });

        // 5. 返回上一页或跳转到"我的"页面
        setTimeout(() => {
          const pages = getCurrentPages();
          if (pages.length > 1) {
            wx.navigateBack();
          } else {
            wx.switchTab({
              url: '/pages/mine/index',
            });
          }
        }, 1500);
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('登录失败:', err);
        wx.showToast({
          title: err.message || '登录失败',
          icon: 'none',
        });
      });
  },

  /**
   * 获取 openid
   */
  getOpenid: function () {
    return new Promise((resolve, reject) => {
      // 如果已经有 openid，直接返回
      const openid = app.globalData.openid || wx.getStorageSync('openid');
      if (openid) {
        app.globalData.openid = openid;
        resolve(openid);
        return;
      }

      // 调用云函数获取 openid
      wx.cloud.callFunction({
        name: 'login',
        data: {},
      })
      .then(res => {
        if (res.result && res.result.openid) {
          app.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          console.log('获取 openid 成功:', res.result.openid);
          resolve(res.result.openid);
        } else {
          reject(new Error('获取 openid 失败'));
        }
      })
      .catch(err => {
        console.error('调用 login 云函数失败:', err);
        reject(err);
      });
    });
  },

  /**
   * 上传头像到云存储
   */
  uploadAvatar: function (tempFilePath) {
    return new Promise((resolve, reject) => {
      // 如果是默认头像或已经是云存储地址，直接返回
      if (tempFilePath.startsWith('cloud://') || tempFilePath.startsWith('/images/')) {
        resolve(tempFilePath);
        return;
      }

      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath,
      })
      .then((res) => {
        console.log('头像上传成功:', res.fileID);
        resolve(res.fileID);
      })
      .catch((err) => {
        console.error('头像上传失败:', err);
        // 上传失败时使用临时路径
        resolve(tempFilePath);
      });
    });
  },

  /**
   * 保存用户信息到数据库
   */
  saveUserInfo: function (userInfo) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          phoneNumber: userInfo.phoneNumber, // 手机号保存到数据库
        },
      })
      .then((res) => {
        if (res.result && res.result.success) {
          resolve(userInfo);
        } else {
          reject(new Error(res.result?.error || '保存失败'));
        }
      })
      .catch((err) => {
        console.error('调用云函数失败:', err);
        reject(err);
      });
    });
  },

  /**
   * 跳过按钮 - 已禁用，必须填写手机号
   */
  skipLogin: function () {
    wx.showToast({
      title: '请填写手机号完成登录',
      icon: 'none',
      duration: 2000,
    });
  },
});
