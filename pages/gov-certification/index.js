// pages/gov-certification/index.js
const app = getApp();

Page({
  data: {
    bio: '',
    department: '',
    position: '',
    workId: '',
    canSubmit: false
  },

  onLoad: function (options) {
    // 检查是否已登录
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.nickName) {
      wx.showModal({
        title: '提示',
        content: '请先完成登录',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    // 加载已有的信息
    this.loadUserProfile();
  },

  /**
   * 加载用户信息
   */
  loadUserProfile: function () {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo.profile) {
      this.setData({
        bio: userInfo.profile.bio || '',
        department: userInfo.profile.department || '',
        position: userInfo.profile.position || '',
        workId: userInfo.profile.workId || ''
      }, () => {
        this.checkCanSubmit();
      });
    }
  },

  /**
   * 输入个人简介
   */
  onBioInput: function (e) {
    this.setData({ bio: e.detail.value }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 输入所属部门
   */
  onDepartmentInput: function (e) {
    this.setData({ department: e.detail.value }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 输入职位
   */
  onPositionInput: function (e) {
    this.setData({ position: e.detail.value }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 输入工作证号
   */
  onWorkIdInput: function (e) {
    this.setData({ workId: e.detail.value }, () => {
      this.checkCanSubmit();
    });
  },

  /**
   * 检查是否可以提交
   */
  checkCanSubmit: function () {
    const { department, position, workId } = this.data;
    const canSubmit = department.trim() && position.trim() && workId.trim();
    this.setData({ canSubmit });
  },

  /**
   * 提交认证申请
   */
  submitApplication: function () {
    const { bio, department, position, workId } = this.data;

    // 验证必填字段
    if (!department.trim() || !position.trim() || !workId.trim()) {
      wx.showToast({
        title: '请填写完整的认证信息',
        icon: 'none'
      });
      return;
    }

    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    wx.showLoading({ title: '提交中...', mask: true });

    // 调用云函数提交认证申请
    wx.cloud.callFunction({
      name: 'applyGovCertification',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        phoneNumber: '', // 如果有手机号可以传入
        department: department.trim(),
        position: position.trim(),
        workId: workId.trim()
      }
    }).then(res => {
      wx.hideLoading();

      if (res.result && res.result.success) {
        // 更新本地用户信息，标记为待审核
        userInfo.profile = {
          ...userInfo.profile,
          bio: bio,
          certificationStatus: 'pending'
        };
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);

        wx.showModal({
          title: '申请已提交',
          content: '您的政府用户认证申请已提交成功！管理员将在1-3个工作日内完成审核，请耐心等待。',
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
        title: '提交失败，请稍后重试',
        icon: 'none'
      });
    });
  }
});

