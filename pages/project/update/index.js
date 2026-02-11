// pages/project/update/index.js
const app = getApp();

Page({
  data: {
    projectId: '',
    nodeIndex: 0,
    nodeName: '',
    
    images: [],
    description: '',
    actualCost: '',
    
    maxImages: 9,
    submitting: false
  },

  onLoad: function (options) {
    if (options.projectId && options.nodeIndex !== undefined) {
      const nodeNames = ['准备', '施工', '验收'];
      this.setData({
        projectId: options.projectId,
        nodeIndex: parseInt(options.nodeIndex),
        nodeName: nodeNames[parseInt(options.nodeIndex)]
      });
    }
  },

  // 输入描述
  onDescInput: function (e) {
    this.setData({ description: e.detail.value });
  },

  // 输入费用
  onCostInput: function (e) {
    this.setData({ actualCost: e.detail.value });
  },

  // 选择图片
  chooseImage: function () {
    const currentCount = this.data.images.length;
    if (currentCount >= this.data.maxImages) {
      wx.showToast({
        title: `最多上传${this.data.maxImages}张照片`,
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

  // 删除图片
  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  // 预览图片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.images
    });
  },

  // 上传图片
  uploadImages: function () {
    if (this.data.images.length === 0) {
      return Promise.resolve([]);
    }

    wx.showLoading({ title: '上传图片中...' });

    const uploadPromises = this.data.images.map((imagePath, index) => {
      const cloudPath = `projects/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交更新
  submitUpdate: function () {
    // 验证
    if (this.data.images.length === 0) {
      wx.showToast({
        title: '请上传现场照片',
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
        name: 'updateProjectNode',
        data: {
          projectId: this.data.projectId,
          nodeIndex: this.data.nodeIndex,
          images: fileIDs,
          description: this.data.description,
          actualCost: Number(this.data.actualCost) || 0
        }
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '更新失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });

      console.error('更新失败:', err);
      wx.showToast({
        title: err.message || '更新失败',
        icon: 'none'
      });
    });
  }
});
