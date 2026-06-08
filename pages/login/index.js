// pages/login/index.js
const app = getApp();
const { getAllTypes, getUserTypeConfig } = require('../../utils/userTypes');

Page({
  data: {
    avatarUrl: '/images/zhi.png',
    nickName: '',
    phoneNumber: '',
    canSubmit: false,
    
    userTypes: [],
    selectedType: 'normal',
    selectedTypeConfig: {},
    showProfileFields: false,
    
    bio: '',
    customFields: {}
  },

  onLoad: function (options) {
    const { getAllTypes } = require('../../utils/userTypes');
    const userTypes = getAllTypes();
    const selectedTypeConfig = getUserTypeConfig('normal');
    
    this.setData({
      userTypes,
      selectedTypeConfig
    });
    
    // ✅ 删除自动登录，让用户填写信息
  },

  selectType: function (e) {
    const typeId = e.currentTarget.dataset.type;
    const typeConfig = getUserTypeConfig(typeId);
    
    this.setData({
      selectedType: typeId,
      selectedTypeConfig: typeConfig,
      showProfileFields: typeId !== 'normal'
    });
    
    console.log('选择用户类型:', typeId, typeConfig.label);
  },

  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  onCustomFieldInput: function (e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const customFields = { ...this.data.customFields };
    customFields[key] = value;
    this.setData({ customFields });
  },

  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail;
    console.log('选择头像:', avatarUrl);
    
    this.setData({
      avatarUrl: avatarUrl,
    }, () => {
      this.checkCanSubmit();
    });
  },

  onNicknameInput: function (e) {
    const nickName = e.detail.value;
    console.log('输入昵称:', nickName);
    
    this.setData({
      nickName: nickName,
    }, () => {
      this.checkCanSubmit();
    });
  },

  onPhoneInput: function (e) {
    let phoneNumber = e.detail.value;
    phoneNumber = phoneNumber.replace(/[^\d]/g, '');
    if (phoneNumber.length > 11) {
      phoneNumber = phoneNumber.slice(0, 11);
    }
    
    this.setData({
      phoneNumber: phoneNumber,
    }, () => {
      this.checkCanSubmit();
    });
  },

  checkCanSubmit: function () {
    const { avatarUrl, nickName, phoneNumber } = this.data;
    const canSubmit = avatarUrl && 
                      nickName && nickName.trim().length > 0 && 
                      phoneNumber && phoneNumber.length === 11;
    this.setData({ canSubmit });
  },

  submitUserInfo: function () {
    const { avatarUrl, nickName, phoneNumber, selectedType, bio, customFields } = this.data;

    if (!phoneNumber || phoneNumber.length !== 11) {
      wx.showToast({
        title: '请输入11位手机号',
        icon: 'none',
      });
      return;
    }

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

    // ✅ 如果是社区工作者或施工方，提交认证申请
    if (selectedType === 'communityWorker') {
      this.submitCommunityWorkerCertification();
      return;
    }
    
    if (selectedType === 'contractor') {
      this.submitContractorCertification();
      return;
    }

    wx.showLoading({
      title: '登录中...',
      mask: true,
    });

    this.getOpenid()
      .then(() => {
        wx.showLoading({ title: '上传头像...', mask: true });
        return this.uploadAvatar(avatarUrl);
      })
      .then((cloudAvatarUrl) => {
        wx.showLoading({ title: '保存信息...', mask: true });
        return this.saveUserInfo({
          nickName: nickName.trim(),
          avatarUrl: cloudAvatarUrl,
          phoneNumber: phoneNumber,
          userType: selectedType,
          profile: {
            bio,
            ...customFields
          }
        });
      })
      .then((userInfo) => {
        wx.hideLoading();
        
        console.log('✅ 用户信息保存成功:', userInfo);
        
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: userInfo.userType,
          badge: userInfo.badge,
          profile: userInfo.profile
        };
        
        console.log('✅ 保存到本地缓存:', publicUserInfo);
        
        app.globalData.userInfo = publicUserInfo;
        app.globalData.userType = userInfo.userType;
        app.globalData.hasLogin = true;
        wx.setStorageSync('userInfo', publicUserInfo);
        wx.setStorageSync('userType', userInfo.userType);
        
        wx.showToast({
          title: '登录成功',
          icon: 'success',
        });

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
   * 🆕 提交施工方认证申请
   */
  submitContractorCertification: function () {
    const { avatarUrl, nickName, phoneNumber, bio, customFields } = this.data;
    const { companyName, contactPerson, serviceArea, specialties } = customFields;

    // ✅ 验证施工方认证信息（不包含 contactPhone）
    if (!companyName || !contactPerson || !serviceArea || !specialties) {
      wx.showToast({
        title: '请填写完整的认证信息',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({
      title: '提交认证申请...',
      mask: true,
    });

    let cloudAvatarUrl = '';

    this.getOpenid()
      .then(() => {
        wx.showLoading({ title: '上传头像...', mask: true });
        return this.uploadAvatar(avatarUrl);
      })
      .then((uploadedAvatarUrl) => {
        cloudAvatarUrl = uploadedAvatarUrl;
        wx.showLoading({ title: '创建用户...', mask: true });
        // ✅ 先创建用户记录
        return this.saveUserInfo({
          nickName: nickName.trim(),
          avatarUrl: cloudAvatarUrl,
          phoneNumber: phoneNumber,
          userType: 'resident',
          profile: {
            bio,
            certificationStatus: 'pending'
          }
        });
      })
      .then((userInfo) => {
        wx.showLoading({ title: '提交申请...', mask: true });
        // ✅ 再提交认证申请
        return wx.cloud.callFunction({
          name: 'applyCertification',
          data: {
            nickName: nickName.trim(),
            avatarUrl: cloudAvatarUrl,
            phoneNumber: phoneNumber,
            userType: 'contractor',
            certificationInfo: {
              companyName: companyName,
              contactPerson: contactPerson,
              serviceArea: serviceArea,
              specialties: specialties
            }
          }
        }).then(res => {
          if (res.result && res.result.success) {
            return userInfo;
          } else {
            throw new Error(res.result?.error || '提交失败');
          }
        });
      })
      .then((userInfo) => {
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: userInfo.userType,
          badge: userInfo.badge,
          profile: userInfo.profile
        };
        
        app.globalData.userInfo = publicUserInfo;
        app.globalData.userType = userInfo.userType;
        app.globalData.hasLogin = true;
        wx.setStorageSync('userInfo', publicUserInfo);
        wx.setStorageSync('userType', userInfo.userType);
        
        wx.showModal({
          title: '认证申请已提交',
          content: '您的施工方认证申请已提交，请等待管理员审核。审核通过后将自动升级为施工方。',
          showCancel: false,
          success: () => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.switchTab({
                url: '/pages/mine/index',
              });
            }
          }
        });
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('提交认证申请失败:', err);
        wx.showToast({
          title: err.message || '提交失败',
          icon: 'none',
        });
      });
  },

  /**
   * 提交社区工作者认证申请
   */
  submitCommunityWorkerCertification: function () {
    const { avatarUrl, nickName, phoneNumber, bio, customFields } = this.data;
    const { community, position, workId } = customFields;

    if (!community || !position || !workId) {
      wx.showToast({
        title: '请填写完整的认证信息',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({
      title: '提交认证申请...',
      mask: true,
    });

    let cloudAvatarUrl = '';

    this.getOpenid()
      .then(() => {
        wx.showLoading({ title: '上传头像...', mask: true });
        return this.uploadAvatar(avatarUrl);
      })
      .then((uploadedAvatarUrl) => {
        cloudAvatarUrl = uploadedAvatarUrl;
        wx.showLoading({ title: '创建用户...', mask: true });
        // ✅ 先创建用户记录
        return this.saveUserInfo({
          nickName: nickName.trim(),
          avatarUrl: cloudAvatarUrl,
          phoneNumber: phoneNumber,
          userType: 'resident',
          profile: {
            bio,
            certificationStatus: 'pending'
          }
        });
      })
      .then((userInfo) => {
        wx.showLoading({ title: '提交申请...', mask: true });
        // ✅ 再提交认证申请
        return wx.cloud.callFunction({
          name: 'applyCommunityWorkerCertification',
          data: {
            nickName: nickName.trim(),
            avatarUrl: cloudAvatarUrl,
            phoneNumber: phoneNumber,
            community: community,
            position: position,
            workId: workId
          }
        }).then(res => {
          if (res.result && res.result.success) {
            return userInfo;
          } else {
            throw new Error(res.result?.error || '提交失败');
          }
        });
      })
      .then((userInfo) => {
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: userInfo.userType,
          badge: userInfo.badge,
          profile: userInfo.profile
        };
        
        app.globalData.userInfo = publicUserInfo;
        app.globalData.userType = userInfo.userType;
        app.globalData.hasLogin = true;
        wx.setStorageSync('userInfo', publicUserInfo);
        wx.setStorageSync('userType', userInfo.userType);
        
        wx.showModal({
          title: '认证申请已提交',
          content: '您的社区工作者认证申请已提交，请等待管理员审核。审核通过后将自动升级为社区工作者。',
          showCancel: false,
          success: () => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.switchTab({
                url: '/pages/mine/index',
              });
            }
          }
        });
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('提交认证申请失败:', err);
        wx.showToast({
          title: err.message || '提交失败',
          icon: 'none',
        });
      });
  },

  getOpenid: function () {
    return new Promise((resolve, reject) => {
      const openid = app.globalData.openid || wx.getStorageSync('openid');
      if (openid) {
        app.globalData.openid = openid;
        resolve(openid);
        return;
      }

      wx.cloud.callFunction({
        name: 'login',
        data: {},
      })
      .then(res => {
        if (res.result && res.result.openid) {
          app.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          console.log('???????');
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

  uploadAvatar: function (tempFilePath) {
    return new Promise((resolve, reject) => {
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
        resolve(tempFilePath);
      });
    });
  },

  saveUserInfo: function (userInfo) {
    return new Promise((resolve, reject) => {
      console.log('🔍 准备保存用户信息:', userInfo);
      
      wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          phoneNumber: userInfo.phoneNumber,
          userType: userInfo.userType,
          profile: userInfo.profile
        },
      })
      .then((res) => {
        console.log('✅ 云函数返回结果:', res.result);
        
        if (res.result && res.result.success) {
          const savedUserInfo = {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            userType: res.result.userType || userInfo.userType,
            badge: res.result.badge || null,
            profile: userInfo.profile
          };
          
          console.log('✅ 保存成功，完整信息:', savedUserInfo);
          resolve(savedUserInfo);
        } else {
          console.error('❌ 保存失败:', res.result?.error);
          reject(new Error(res.result?.error || '保存失败'));
        }
      })
      .catch((err) => {
        console.error('❌ 调用云函数失败:', err);
        reject(err);
      });
    });
  },

  skipLogin: function () {
    wx.showToast({
      title: '请填写手机号完成登录',
      icon: 'none',
      duration: 2000,
    });
  },
});
