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
        targetId: app.globalData.openid,
        fieldMode: 'full'
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const profile = res.result.data.profile || {};
        this.setData({
          bio: profile.bio || '',
          customFields: profile
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
    
    // 显示认证信息表单（如果需要认证）
    this.setData({
      selectedType: typeId,
      selectedTypeConfig: typeConfig,
      showProfileFields: typeConfig.needCertification || false
    });
  },

  /**
   * 输入个人简介
   */
  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  /**
   * 输入自定义字段（认证信息）
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
    
    // 获取当前用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.nickName) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'none'
      });
      return;
    }
    
    // 🆕 如果选择需要认证的角色，提交认证申请
    const selectedTypeConfig = getUserTypeConfig(selectedType);
    if (selectedTypeConfig.needCertification && currentType !== selectedType) {
      this.submitCertificationApplication();
      return;
    }
    
    // 普通用户切换，直接保存
    wx.showLoading({ title: '保存中...', mask: true });
    
    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
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
   * 🆕 提交角色认证申请（统一方法）
   */
  submitCertificationApplication: function () {
    const { selectedType, bio, customFields } = this.data;
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');

    // 根据不同角色验证必填字段
    let isValid = true;
    let errorMsg = '';

    if (selectedType === 'communityWorker') {
      const { community, position, workId } = customFields;
    if (!community || !position || !workId) {
        isValid = false;
        errorMsg = '请填写完整的社区工作者认证信息';
      }
    } else if (selectedType === 'designer') {
      const { organization, title, expertise } = customFields;
      if (!organization || !title || !expertise) {
        isValid = false;
        errorMsg = '请填写完整的设计者认证信息';
      }
    } else if (selectedType === 'contractor') {
      const { companyName, contactPerson, contactPhone, serviceArea, specialties } = customFields;
      if (!companyName || !contactPerson || !contactPhone || !serviceArea || !specialties) {
        isValid = false;
        errorMsg = '请填写完整的施工方认证信息';
      }
    }

    if (!isValid) {
      wx.showToast({
        title: errorMsg,
        icon: 'none',
      });
      return;
    }

    wx.showLoading({
      title: '提交认证申请...',
      mask: true,
    });

    // 调用统一的认证申请云函数
    wx.cloud.callFunction({
      name: 'applyCertification',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        userType: selectedType,
        certificationInfo: customFields
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const typeLabel = selectedType === 'communityWorker' ? '社区工作者' :
                         selectedType === 'designer' ? '设计者' : '施工方';
        wx.showModal({
          title: '认证申请已提交',
          content: `您的${typeLabel}认证申请已提交，请等待管理员审核。审核通过后将自动升级为${typeLabel}。`,
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
