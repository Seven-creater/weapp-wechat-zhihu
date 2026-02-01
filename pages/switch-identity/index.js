// pages/switch-identity/index.js
const app = getApp();
const { getAllTypes, getUserTypeConfig, getBadgeStyle } = require('../../utils/userTypes');

Page({
  data: {
    currentType: 'normal',
    currentTypeConfig: {},
    allTypes: [],
    selectedType: 'normal',
    selectedTypeConfig: {},
    
    // 补充信息
    showProfileFields: false,
    bio: '',
    customFields: {}
  },

  onLoad: function (options) {
    // 加载所有用户类型
    const allTypes = getAllTypes();
    
    // 获取当前用户类型
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const currentType = userInfo.userType || 'normal';
    const currentTypeConfig = getUserTypeConfig(currentType);
    
    this.setData({
      allTypes,
      currentType,
      currentTypeConfig,
      selectedType: currentType,
      selectedTypeConfig: currentTypeConfig
    });
    
    // 加载用户的补充信息
    this.loadUserProfile();
  },

  /**
   * 加载用户补充信息
   */
  loadUserProfile: function () {
    wx.showLoading({ title: '加载中...' });
    
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: app.globalData.openid
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const profile = res.result.data.profile || {};
        this.setData({
          bio: profile.bio || '',
          customFields: {
            community: profile.community || '',
            position: profile.position || '',
            workId: profile.workId || ''
          }
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载用户信息失败:', err);
    });
  },

  /**
   * 选择用户类型
   */
  selectType: function (e) {
    const typeId = e.currentTarget.dataset.type;
    const typeConfig = getUserTypeConfig(typeId);
    
    // 🔧 允许选择社区工作者，显示认证信息表单
    this.setData({
      selectedType: typeId,
      selectedTypeConfig: typeConfig,
      showProfileFields: typeId !== 'normal'
    });
  },

  /**
   * 输入个人简介
   */
  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  /**
   * 输入自定义字段（政府认证信息）
   */
  onCustomFieldInput: function (e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const customFields = { ...this.data.customFields };
    customFields[key] = value;
    this.setData({ customFields });
  },

  /**
   * 保存身份切换
   */
  saveIdentity: function () {
    const { selectedType, bio, customFields, currentType } = this.data;
    
    // 🔧 获取当前用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.nickName) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'none'
      });
      return;
    }
    
    // 🆕 如果选择社区工作者，提交认证申请
    if (selectedType === 'communityWorker' && currentType !== 'communityWorker') {
      this.submitCommunityWorkerCertification();
      return;
    }
    
    wx.showLoading({ title: '保存中...', mask: true });
    
    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        nickName: userInfo.nickName,      // 🔧 添加昵称
        avatarUrl: userInfo.avatarUrl,    // 🔧 添加头像
        userType: selectedType,
        profile: {
          bio,
          ...customFields
        }
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        // 更新本地缓存
        const userInfo = app.globalData.userInfo || {};
        userInfo.userType = selectedType;
        userInfo.badge = res.result.badge;
        
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
        
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: res.result?.error || '切换失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('切换身份失败:', err);
      wx.showToast({
        title: '切换失败',
        icon: 'none'
      });
    });
  },

  /**
   * 🆕 提交社区工作者认证申请
   */
  submitCommunityWorkerCertification: function () {
    const { bio, customFields } = this.data;
    const { community, position, workId } = customFields;
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');

    // 验证认证信息
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

    wx.cloud.callFunction({
      name: 'applyCommunityWorkerCertification',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        phoneNumber: '', // 从数据库获取
        community: community,
        position: position,
        workId: workId
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        wx.showModal({
          title: '认证申请已提交',
          content: '您的社区工作者认证申请已提交，请等待管理员审核。审核通过后将自动升级为社区工作者。',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      } else {
        wx.showToast({
          title: res.result?.error || '提交失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('提交认证申请失败:', err);
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      });
    });
  }
});

