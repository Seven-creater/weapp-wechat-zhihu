const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    content: '',
    images: [],
    type: 'share', // 默认分享类型
    submitting: false
  },

  onLoad: function() {
    // 页面加载时初始化
  },

  // 输入内容变化
  onContentInput: function(e) {
    this.setData({
      content: e.detail.value
    });
  },

  // 选择图片
  chooseImage: function() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.images.length, // 最多9张
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePaths = res.tempFilePaths;
        that.setData({
          images: that.data.images.concat(tempFilePaths)
        });
      },
      fail: function(err) {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  // 删除图片
  removeImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({
      images: images
    });
  },

  // 预览图片
  previewImage: function(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.images
    });
  },

  // 选择帖子类型
  selectType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      type: type
    });
  },

  // 提交帖子
  submitPost: function() {
    const { content, images, type, submitting } = this.data;

    if (submitting) return;

    // 验证内容
    if (!content.trim()) {
      wx.showToast({
        title: '请输入帖子内容',
        icon: 'none'
      });
      return;
    }

    if (content.trim().length < 5) {
      wx.showToast({
        title: '内容至少5个字',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    // 显示提交中状态
    wx.showLoading({
      title: '发布中...',
      mask: true
    });

    app
      .checkLogin()
      .catch(() => {
        return new Promise((resolve, reject) => {
          wx.showModal({
            title: '提示',
            content: '请先登录',
            confirmText: '去登录',
            cancelText: '取消',
            success: (res) => {
              if (res.confirm) {
                app
                  .login()
                  .then(() => resolve())
                  .catch((err) => reject(err));
              } else {
                reject(new Error('未登录'));
              }
            }
          });
        });
      })
      .then(() => {
        return this.uploadImages(images).then((imageUrls) => {
          return this.savePostToDatabase(content, imageUrls, type);
        });
      })
      .then(() => {
        wx.hideLoading();
        wx.showToast({
          title: '发布成功',
          icon: 'success',
          duration: 1500
        });

        // 发布成功后返回社区页面
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      })
      .catch((error) => {
        wx.hideLoading();
        if (error && error.message === '未登录') {
          return;
        }
        wx.showToast({
          title: '发布失败，请重试',
          icon: 'none'
        });
        console.error('发布失败:', error);
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  // 上传图片到云存储
  uploadImages: function(images) {
    if (images.length === 0) {
      return Promise.resolve([]);
    }

    const uploads = images.map((filePath, index) => {
      const fileExt = filePath.split('.').pop() || 'jpg';
      const cloudPath = `posts/${Date.now()}-${index}.${fileExt}`;
      return wx.cloud
        .uploadFile({
          cloudPath,
          filePath
        })
        .then((res) => res.fileID);
    });

    return Promise.all(uploads);
  },

  // 保存帖子到数据库
  savePostToDatabase: function(content, imageUrls, type) {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');

    const postData = {
      userInfo: userInfo || {
        nickName: '匿名用户',
        avatarUrl: '/images/default-avatar.png'
      },
      content: content.trim(),
      images: imageUrls,
      type: type,
      stats: {
        view: 0,
        like: 0,
        comment: 0
      },
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    return db.collection('posts').add({
      data: postData
    });
  },

  // 取消发布
  cancelPost: function() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消发布吗？已输入的内容将丢失',
      confirmColor: '#002fa7',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  // 清空内容
  clearContent: function() {
    this.setData({
      content: '',
      images: []
    });
  }
})
