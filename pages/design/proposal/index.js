// pages/design/proposal/index.js
const app = getApp();

Page({
  data: {
    postId: '',
    post: null,
    
    content: '',
    images: [],
    priceAdjustment: 0,
    adjustmentReason: '',
    
    maxImages: 9,
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
          this.setData({ post: res.data });
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

  // 输入方案内容
  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  // 输入预算调整
  onPriceInput: function (e) {
    this.setData({ priceAdjustment: e.detail.value });
  },

  // 输入调整原因
  onReasonInput: function (e) {
    this.setData({ adjustmentReason: e.detail.value });
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
      const cloudPath = `design-proposals/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交设计方案
  submitProposal: function () {
    // 验证
    if (!this.data.content || this.data.content.trim().length === 0) {
      wx.showToast({
        title: '请输入设计方案',
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
        name: 'createDesignProposal',
        data: {
          postId: this.data.postId,
          content: this.data.content,
          images: fileIDs,
          priceAdjustment: Number(this.data.priceAdjustment) || 0,
          adjustmentReason: this.data.adjustmentReason
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



