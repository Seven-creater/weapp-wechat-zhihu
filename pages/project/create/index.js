// pages/project/create/index.js
const app = getApp();

Page({
  data: {
    postId: '',
    post: null,
    
    title: '',
    contactPhone: '',
    
    submitting: false
  },

  onLoad: function (options) {
    if (options.postId) {
      this.setData({ postId: options.postId });
      this.loadPostDetail();
    }
  },

  // 加载帖子详情
  loadPostDetail: function () {
    wx.showLoading({ title: '加载中...' });
    
    const db = wx.cloud.database();
    db.collection('posts')
      .doc(this.data.postId)
      .get()
      .then(res => {
        wx.hideLoading();
        if (res.data) {
          this.setData({ 
            post: res.data,
            title: `${res.data.category || '无障碍'}改造项目`
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载帖子失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  // 输入项目名称
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  // 输入联系电话
  onPhoneInput: function (e) {
    this.setData({ contactPhone: e.detail.value });
  },

  // 创建项目
  createProject: function () {
    // 验证
    if (!this.data.title || this.data.title.trim().length === 0) {
      wx.showToast({
        title: '请输入项目名称',
        icon: 'none'
      });
      return;
    }

    if (!this.data.contactPhone || this.data.contactPhone.trim().length === 0) {
      wx.showToast({
        title: '请输入联系电话',
        icon: 'none'
      });
      return;
    }

    // 验证手机号格式
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(this.data.contactPhone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    if (this.data.submitting) return;

    wx.showModal({
      title: '确认创建项目',
      content: '创建后将开始施工流程，确定要创建吗？',
      success: (res) => {
        if (res.confirm) {
          this.submitProject();
        }
      }
    });
  },

  // 提交项目
  submitProject: function () {
    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...' });

    wx.cloud.callFunction({
      name: 'createProject',
      data: {
        postId: this.data.postId,
        title: this.data.title,
        contactPhone: this.data.contactPhone
      }
    }).then(res => {
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '项目创建成功',
          icon: 'success'
        });

        // 跳转到项目详情页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/project/detail/index?id=${res.result.projectId}`
          });
        }, 1500);
      } else {
        throw new Error(res.result?.error || '创建失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });

      console.error('创建项目失败:', err);
      wx.showToast({
        title: err.message || '创建失败',
        icon: 'none'
      });
    });
  }
});



