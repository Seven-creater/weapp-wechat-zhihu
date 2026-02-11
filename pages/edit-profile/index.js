// pages/edit-profile/index.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    bio: '',
    phoneNumber: '',
    originalAvatarUrl: '',
    originalNickName: '',
    originalBio: '',
    originalPhoneNumber: '',
    avatarChanged: false
  },

  onLoad: function (options) {
    this.loadUserInfo();
  },

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
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载用户信息失败:', err);
      
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

  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail;
    console.log('选择头像:', avatarUrl);

    this.setData({
      avatarUrl: avatarUrl,
      avatarChanged: true
    });
  },

  onNicknameInput: function (e) {
    const nickName = e.detail.value;
    this.setData({
      nickName: nickName,
    });
  },

  onBioInput: function (e) {
    const bio = e.detail.value;
    this.setData({
      bio: bio,
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
    });
  },

  handleSave: function () {
    const { nickName, avatarUrl, bio, phoneNumber, avatarChanged } = this.data;

    if (!nickName || !nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none',
      });
      return;
    }

    if (phoneNumber && phoneNumber.length > 0) {
      if (phoneNumber.length !== 11) {
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
    }

    wx.showLoading({ title: '保存中...' });

    if (avatarChanged && avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('/images/')) {
      this.uploadAndSaveAvatar(avatarUrl, nickName.trim(), bio, phoneNumber);
    } else {
      this.saveUserInfo(avatarUrl, nickName.trim(), bio, phoneNumber);
    }
  },

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

  saveUserInfo: function (avatarUrl, nickName, bio, phoneNumber) {
    const currentUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    
    const updatedProfile = {
      ...(currentUserInfo.profile || {}),
      bio: bio
    };
    
    // ✅ 关键修复：不传递 userType，让云函数保持数据库中的原值
    const updateData = {
      nickName: nickName,
      avatarUrl: avatarUrl,
      // 不传递 userType！这样云函数就不会修改用户身份
      profile: updatedProfile
    };
    
    if (phoneNumber && phoneNumber.length === 11) {
      updateData.phoneNumber = phoneNumber;
    }
    
    console.log('📝 保存用户信息（不包含 userType）:', updateData);
    
    return wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: updateData,
    })
    .then((res) => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        // ✅ 从云函数返回的数据中获取 userType（保持不变）
        const userInfo = {
          nickName: nickName,
          avatarUrl: avatarUrl,
          userType: res.result.userType || currentUserInfo.userType || 'CommunityWorker',
          badge: res.result.badge || currentUserInfo.badge || null,
          profile: updatedProfile
        };
        
        console.log('✅ 保存成功，用户身份:', userInfo.userType);
        
        app.globalData.userInfo = userInfo;
        app.globalData.userType = userInfo.userType;
        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('userType', userInfo.userType);

        wx.showToast({
          title: '保存成功',
          icon: 'success',
        });

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

  handleCancel: function () {
    wx.navigateBack();
  },
});
