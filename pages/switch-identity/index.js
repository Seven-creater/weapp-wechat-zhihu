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
            department: profile.department || '',
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
    
    // 如果选择政府类型，跳转到认证申请页面
    if (typeId === 'government') {
      wx.showModal({
        title: '需要认证',
        content: '政府/监管部门身份需要进行专业认证。是否前往填写认证信息？',
        confirmText: '去认证',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 跳转到登录页面，选择政府身份
            wx.navigateTo({
              url: '/pages/gov-certification/index'
            });
          }
        }
      });
      return;
    }
    
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
    const { selectedType, bio, customFields } = this.data;
    
    // 🔧 获取当前用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.nickName) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'none'
      });
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
          ...customFields  // 政府认证信息
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
  }
});

