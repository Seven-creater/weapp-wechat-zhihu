// pages/edit-profile/index.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    originalAvatarUrl: '',
    originalNickName: '',
  },

  onLoad: function (options) {
    // 加载当前用户信息
    this.loadUserInfo();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    
    this.setData({
      avatarUrl: userInfo.avatarUrl || '/images/zhi.png',
      nickName: userInfo.nickName || '',
      originalAvatarUrl: userInfo.avatarUrl || '/images/zhi.png',
      originalNickName: userInfo.nickName || '',
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
   * 保存用户信息
   */
  handleSave: function () {
    const { nickName, avatarUrl } = this.data;

    // 验证昵称
    if (!nickName || !nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    // 如果头像是临时文件，需要先上传
    if (avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('/images/')) {
      this.uploadAndSaveAvatar(avatarUrl, nickName.trim());
    } else {
      this.saveUserInfo(avatarUrl, nickName.trim());
    }
  },

  /**
   * 上传头像到云存储
   */
  uploadAndSaveAvatar: function (tempFilePath, nickName) {
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
    })
    .then((res) => {
      console.log('头像上传成功:', res.fileID);
      return this.saveUserInfo(res.fileID, nickName);
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
  saveUserInfo: function (avatarUrl, nickName) {
    return wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        nickName: nickName,
        avatarUrl: avatarUrl,
      },
    })
    .then((res) => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        // 更新全局状态和本地缓存
        const userInfo = {
          nickName: nickName,
          avatarUrl: avatarUrl,
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









