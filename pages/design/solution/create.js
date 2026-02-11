// pages/design/solution/create.js
const app = getApp();

Page({
  data: {
    postId: '',
    description: '',
    images: [],
    budgetAdjustment: '',
    
    maxImages: 9,
    submitting: false
  },

  onLoad: function (options) {
    if (options.postId) {
      this.setData({ postId: options.postId });
    }
  },

  // 输入方案描述
  onDescInput: function (e) {
    this.setData({ description: e.detail.value });
  },

  // 输入预算调整
  onBudgetInput: function (e) {
    this.setData({ budgetAdjustment: e.detail.value });
  },

  // 选择图片
  chooseImage: function () {
    const currentCount = this.data.images.length;
    if (currentCount >= this.data.maxImages) {
      wx.showToast({
        title: `最多上传${this.data.maxImages}张图片`,
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: this.data.maxImages - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          images: [...this.data.images, ...newImages]
        });
      }
    });
  },

  // 预览图片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.images
    });
  },

  // 删除图片
  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  // 上传图片
  uploadImages: function () {
    if (this.data.images.length === 0) {
      return Promise.resolve([]);
    }

    wx.showLoading({ title: '上传图片中...' });

    const uploadPromises = this.data.images.map((imagePath, index) => {
      const cloudPath = `design-solutions/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交设计方案
  submitSolution: function () {
    // 验证
    if (!this.data.description || this.data.description.trim().length === 0) {
      wx.showToast({
        title: '请填写设计方案描述',
        icon: 'none'
      });
      return;
    }

    if (this.data.images.length === 0) {
      wx.showToast({
        title: '请上传设计图纸',
        icon: 'none'
      });
      return;
    }

    if (this.data.submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    // 上传图片
    this.uploadImages().then(fileIDs => {
      // 调用云函数
      return wx.cloud.callFunction({
        name: 'createDesignSolution',
        data: {
          postId: this.data.postId,
          description: this.data.description,
          images: fileIDs,
          budgetAdjustment: Number(this.data.budgetAdjustment) || 0
        }
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '提交成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '提交失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });

      console.error('提交失败:', err);
      wx.showToast({
        title: err.message || '提交失败',
        icon: 'none'
      });
    });
  }
});



