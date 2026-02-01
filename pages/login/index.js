// pages/login/index.js
const app = getApp();
const { getAllTypes, getUserTypeConfig } = require('../../utils/userTypes');

Page({
  data: {
    avatarUrl: '/images/zhi.png', // 默认头像
    nickName: '',
    phoneNumber: '', // 手机号（必填）
    canSubmit: false,
    
    // 🆕 用户身份相关
    userTypes: [],           // 可选的用户类型列表
    selectedType: 'normal',  // 当前选择的类型
    selectedTypeConfig: {},  // 当前类型的配置
    showProfileFields: false, // 是否显示补充信息
    
    // 🆕 补充信息（简化版）
    bio: '',              // 个人简介
    customFields: {}      // 自定义字段（仅政府用户）
  },

  onLoad: function (options) {
    // 🆕 加载所有用户类型列表（包含政府，允许用户申请认证）
    const { getAllTypes } = require('../../utils/userTypes');
    const userTypes = getAllTypes();
    const selectedTypeConfig = getUserTypeConfig('normal');
    
    this.setData({
      userTypes,
      selectedTypeConfig
    });
    
    // 🔧 尝试自动登录
    this.tryAutoLogin();
  },

  /**
   * 🆕 尝试自动登录
   */
  tryAutoLogin: function () {
    console.log('========================================');
    console.log('🔍 开始尝试自动登录');
    console.log('========================================');
    
    wx.showLoading({ title: '登录中...', mask: true });
    
    // 1. 先获取 openid
    this.getOpenid()
      .then((openid) => {
        console.log('========================================');
        console.log('✅ 获取到 openid:', openid);
        console.log('========================================');
        
        // 2. 从数据库查询用户信息
        return wx.cloud.callFunction({
          name: 'getUserInfo',
          data: {
            targetId: openid
          }
        });
      })
      .then((res) => {
        console.log('========================================');
        console.log('📊 云函数返回结果:');
        console.log('res.result:', res.result);
        console.log('========================================');
        
        if (res.result && res.result.success && res.result.data) {
          const userData = res.result.data;
          const userInfo = userData.userInfo;
          
          console.log('========================================');
          console.log('📋 用户数据详情:');
          console.log('nickName:', userInfo.nickName);
          console.log('avatarUrl:', userInfo.avatarUrl);
          console.log('phoneNumber:', userData.phoneNumber);
          console.log('userType:', userData.userType);
          console.log('profile:', userData.profile);
          console.log('========================================');
          
          // 🔧 检查是否已经注册过（有昵称和手机号）
          if (userInfo.nickName && userData.phoneNumber) {
            console.log('========================================');
            console.log('✅ 用户已注册，准备自动登录');
            console.log('========================================');
            
            // 构建完整的用户信息
            const fullUserInfo = {
              nickName: userInfo.nickName,
              avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
              userType: userData.userType || 'normal',
              badge: userData.badge || null,
              profile: userData.profile || {}
            };
            
            // 保存到全局和本地
            app.globalData.userInfo = fullUserInfo;
            app.globalData.hasLogin = true;
            wx.setStorageSync('userInfo', fullUserInfo);
            
            console.log('========================================');
            console.log('✅ 用户信息已保存到全局和本地');
            console.log('========================================');
            
            wx.hideLoading();
            
            console.log('========================================');
            console.log('🔧 准备跳转到"我的"页面');
            console.log('========================================');
            
            // 🔧 使用 reLaunch 强制跳转到"我的"页面
            wx.reLaunch({
              url: '/pages/mine/index',
              success: () => {
                console.log('========================================');
                console.log('✅ 跳转成功');
                console.log('========================================');
              },
              fail: (err) => {
                console.log('========================================');
                console.error('❌ 跳转失败:', err);
                console.log('========================================');
              }
            });
          } else {
            // 🔧 用户未注册，显示注册表单
            wx.hideLoading();
            console.log('========================================');
            console.log('⚠️ 用户未注册，需要填写资料');
            console.log('nickName 是否存在:', !!userInfo.nickName);
            console.log('phoneNumber 是否存在:', !!userData.phoneNumber);
            console.log('========================================');
            this.showRegistrationForm();
          }
        } else {
          // 🔧 用户不存在，显示注册表单
          wx.hideLoading();
          console.log('========================================');
          console.log('⚠️ 用户不存在，需要注册');
          console.log('res.result.success:', res.result?.success);
          console.log('res.result.data:', res.result?.data);
          console.log('========================================');
          this.showRegistrationForm();
        }
      })
      .catch((err) => {
        wx.hideLoading();
        console.log('========================================');
        console.error('❌ 自动登录失败:', err);
        console.log('========================================');
        // 失败时显示注册表单
        this.showRegistrationForm();
      });
  },

  /**
   * 🆕 显示注册表单（填写资料）
   */
  showRegistrationForm: function () {
    // 不需要特殊处理，表单已经在页面上了
    console.log('📝 显示注册表单');
  },

  /**
   * 🆕 选择用户类型
   */
  selectType: function (e) {
    const typeId = e.currentTarget.dataset.type;
    const typeConfig = getUserTypeConfig(typeId);
    
    this.setData({
      selectedType: typeId,
      selectedTypeConfig: typeConfig,
      showProfileFields: typeId !== 'normal' // 非普通用户显示补充信息
    });
    
    console.log('选择用户类型:', typeId, typeConfig.label);
  },

  /**
   * 🆕 输入个人简介
   */
  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  /**
   * 🆕 输入自定义字段（政府认证信息）
   */
  onCustomFieldInput: function (e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const customFields = { ...this.data.customFields };
    customFields[key] = value;
    this.setData({ customFields });
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
    const { avatarUrl, nickName, phoneNumber, selectedType, bio, customFields } = this.data;

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

    // 🆕 如果是社区工作者，提交认证申请
    if (selectedType === 'communityWorker') {
      this.submitCommunityWorkerCertification();
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
          userType: selectedType,  // 🆕 用户类型
          profile: {               // 🆕 补充信息（简化版）
            bio,
            ...customFields        // 政府认证信息
          }
        });
      })
      .then((userInfo) => {
        wx.hideLoading();
        
        console.log('✅ 用户信息保存成功:', userInfo);
        
        // 4. 更新全局状态（注意：不在本地存储手机号，保护隐私）
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: userInfo.userType,  // 🆕 用户类型
          badge: userInfo.badge,        // 🆕 徽章信息
          profile: userInfo.profile     // 🆕 补充信息
          // 不存储 phoneNumber 到本地
        };
        
        console.log('✅ 保存到本地缓存:', publicUserInfo);
        
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
   * 🆕 提交社区工作者认证申请
   */
  submitCommunityWorkerCertification: function () {
    const { avatarUrl, nickName, phoneNumber, bio, customFields } = this.data;
    const { community, position, workId } = customFields;

    // 验证社区工作者认证信息
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

    // 1. 先获取 openid
    this.getOpenid()
      .then(() => {
        wx.showLoading({ title: '上传头像...', mask: true });
        // 2. 上传头像
        return this.uploadAvatar(avatarUrl);
      })
      .then((cloudAvatarUrl) => {
        wx.showLoading({ title: '提交申请...', mask: true });
        // 3. 提交认证申请
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
        });
      })
      .then((res) => {
        wx.hideLoading();
        
        if (res.result && res.result.success) {
          // 先保存为普通用户，等待审核通过后升级为社区工作者
          return this.saveUserInfo({
            nickName: nickName.trim(),
            avatarUrl: avatarUrl,
            phoneNumber: phoneNumber,
            userType: 'normal',  // 暂时保存为普通用户
            profile: {
              bio,
              certificationStatus: 'pending' // 标记认证状态
            }
          });
        } else {
          throw new Error(res.result?.error || '提交失败');
        }
      })
      .then((userInfo) => {
        // 更新本地状态
        const publicUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: userInfo.userType,
          badge: userInfo.badge,
          profile: userInfo.profile
        };
        
        app.globalData.userInfo = publicUserInfo;
        app.globalData.hasLogin = true;
        wx.setStorageSync('userInfo', publicUserInfo);
        
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
      console.log('🔍 准备保存用户信息:', userInfo);
      
      wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          phoneNumber: userInfo.phoneNumber, // 手机号保存到数据库
          userType: userInfo.userType,       // 🆕 用户类型
          profile: userInfo.profile          // 🆕 补充信息
        },
      })
      .then((res) => {
        console.log('✅ 云函数返回结果:', res.result);
        
        if (res.result && res.result.success) {
          // 🔧 使用云函数返回的完整信息
          const savedUserInfo = {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            userType: res.result.userType || userInfo.userType,  // 使用云函数返回的
            badge: res.result.badge || null,                     // 使用云函数返回的
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
