// pages/post/daily/index.js
const app = getApp();

Page({
  data: {
    content: '',
    images: [],
    location: null,
    formattedAddress: '',
    
    maxImages: 9,
    submitting: false
  },

  onLoad: function (options) {
    // 可以从参数获取位置信息
    if (options.latitude && options.longitude) {
      this.setData({
        location: {
          latitude: parseFloat(options.latitude),
          longitude: parseFloat(options.longitude)
        },
        formattedAddress: options.address || ''
      });
    }
  },

  // 输入内容
  onContentInput: function (e) {
    this.setData({
      content: e.detail.value
    });
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

  // 选择位置
  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          formattedAddress: res.name || res.address
        });
      },
      fail: (err) => {
        console.error('选择位置失败:', err);
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中开启位置权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      }
    });
  },

  // 清除位置
  clearLocation: function () {
    this.setData({
      location: null,
      formattedAddress: ''
    });
  },

  // 上传图片到云存储
  uploadImages: function () {
    if (this.data.images.length === 0) {
      return Promise.resolve([]);
    }

    wx.showLoading({ title: '上传图片中...' });

    const uploadPromises = this.data.images.map((imagePath, index) => {
      const cloudPath = `daily-posts/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 发布帖子
  publishPost: function () {
    // 验证内容
    if (!this.data.content || this.data.content.trim().length === 0) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      });
      return;
    }

    // 日常分享不强制要求位置和图片

    if (this.data.submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中...' });

    // 先上传图片
    this.uploadImages().then(fileIDs => {
      // 调用云函数创建帖子
      return wx.cloud.callFunction({
        name: 'createDailyPost',
        data: {
          content: this.data.content,
          images: fileIDs,
          location: this.data.location,
          formattedAddress: this.data.formattedAddress
        }
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '发布成功',
          icon: 'success'
        });

        // 延迟返回
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '发布失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });

      console.error('发布失败:', err);
      wx.showToast({
        title: err.message || '发布失败',
        icon: 'none'
      });
    });
  }
});

