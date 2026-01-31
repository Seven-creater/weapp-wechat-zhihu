// pages/edit-profile/index.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    bio: '',  // 🆕 个人简介
    phoneNumber: '',  // 🆕 手机号
    originalAvatarUrl: '',
    originalNickName: '',
    originalBio: '',  // 🆕 原始简介
    originalPhoneNumber: '',  // 🆕 原始手机号
    avatarChanged: false  // 🔧 标记头像是否改变
  },

  onLoad: function (options) {
    // 加载当前用户信息
    this.loadUserInfo();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    
    if (!openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({ title: '加载中...' });
    
    // 🔧 从数据库加载完整用户信息（包括手机号）
    wx.cloud.callFunction({
      name: 'getUserInfo',
      data: {
        targetId: openid
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success && res.result.data) {
        const userData = res.result.data;
        const userInfo = userData.userInfo || {};
        const bio = (userData.profile && userData.profile.bio) || '';
        const phoneNumber = userData.phoneNumber || '';
        
        this.setData({
          avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
          nickName: userInfo.nickName || '',
          bio: bio,
          phoneNumber: phoneNumber,
          originalAvatarUrl: userInfo.avatarUrl || '/images/zhi.png',
          originalNickName: userInfo.nickName || '',
          originalBio: bio,
          originalPhoneNumber: phoneNumber,
          avatarChanged: false
        });
      } else {
        // 如果数据库查询失败，使用本地缓存
        const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
        const bio = (userInfo.profile && userInfo.profile.bio) || '';
        
        this.setData({
          avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
          nickName: userInfo.nickName || '',
          bio: bio,
          phoneNumber: '',  // 本地缓存没有手机号
          originalAvatarUrl: userInfo.avatarUrl || '/images/zhi.png',
          originalNickName: userInfo.nickName || '',
          originalBio: bio,
          originalPhoneNumber: '',
          avatarChanged: false
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载用户信息失败:', err);
      
      // 失败时使用本地缓存
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
      const bio = (userInfo.profile && userInfo.profile.bio) || '';
      
      this.setData({
        avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
        nickName: userInfo.nickName || '',
        bio: bio,
        phoneNumber: '',
        originalAvatarUrl: userInfo.avatarUrl || '/images/zhi.png',
        originalNickName: userInfo.nickName || '',
        originalBio: bio,
        originalPhoneNumber: '',
        avatarChanged: false
      });
    });
  },

  /**
   * 选择头像（微信官方推荐方式）
   */
  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail;
    console.log('选择头像:', avatarUrl);

    this.setData({
      avatarUrl: avatarUrl,
      avatarChanged: true  // 🔧 标记头像已改变
    });
  },

  /**
   * 昵称输入
   */
  onNicknameInput: function (e) {
    const nickName = e.detail.value;
    this.setData({
      nickName: nickName,
    });
  },

  /**
   * 🆕 简介输入
   */
  onBioInput: function (e) {
    const bio = e.detail.value;
    this.setData({
      bio: bio,
    });
  },

  /**
   * 🆕 手机号输入
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
    });
  },

  /**
   * 保存用户信息
   */
  handleSave: function () {
    const { nickName, avatarUrl, bio, phoneNumber, avatarChanged } = this.data;

    // 验证昵称
    if (!nickName || !nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none',
      });
      return;
    }

    // 🆕 验证手机号（如果填写了）
    if (phoneNumber && phoneNumber.length > 0) {
      if (phoneNumber.length !== 11) {
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
    }

    wx.showLoading({ title: '保存中...' });

    // 🔧 只有头像改变了才需要上传
    if (avatarChanged && avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('/images/')) {
      this.uploadAndSaveAvatar(avatarUrl, nickName.trim(), bio, phoneNumber);
    } else {
      // 头像没有改变，直接保存
      this.saveUserInfo(avatarUrl, nickName.trim(), bio, phoneNumber);
    }
  },

  /**
   * 上传头像到云存储
   */
  uploadAndSaveAvatar: function (tempFilePath, nickName, bio, phoneNumber) {
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
    })
    .then((res) => {
      console.log('头像上传成功:', res.fileID);
      return this.saveUserInfo(res.fileID, nickName, bio, phoneNumber);
    })
    .catch((err) => {
      wx.hideLoading();
      console.error('头像上传失败:', err);
      wx.showToast({
        title: '上传失败',
        icon: 'none',
      });
    });
  },

  /**
   * 保存用户信息到数据库
   */
  saveUserInfo: function (avatarUrl, nickName, bio, phoneNumber) {
    // 🔧 获取当前完整的用户信息，保留 userType 和 profile
    const currentUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    
    // 🔧 合并 profile，保留其他字段（如政府认证信息）
    const updatedProfile = {
      ...(currentUserInfo.profile || {}),
      bio: bio  // 更新简介
    };
    
    const updateData = {
      nickName: nickName,
      avatarUrl: avatarUrl,
      userType: currentUserInfo.userType || 'normal',  // 🔧 保留用户类型
      profile: updatedProfile                          // 🔧 保留完整的 profile
    };
    
    // 🆕 如果提供了手机号，则更新手机号
    if (phoneNumber && phoneNumber.length === 11) {
      updateData.phoneNumber = phoneNumber;
    }
    
    return wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: updateData,
    })
    .then((res) => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        // 🔧 更新全局状态和本地缓存（保留完整信息）
        const userInfo = {
          nickName: nickName,
          avatarUrl: avatarUrl,
          userType: res.result.userType || currentUserInfo.userType || 'normal',
          badge: res.result.badge || currentUserInfo.badge || null,
          profile: updatedProfile
        };
        
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);

        wx.showToast({
          title: '保存成功',
          icon: 'success',
        });

        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '保存失败');
      }
    })
    .catch((err) => {
      wx.hideLoading();
      console.error('保存用户信息失败:', err);
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none',
      });
    });
  },

  /**
   * 取消编辑
   */
  handleCancel: function () {
    wx.navigateBack();
  },
});









