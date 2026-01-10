const app = getApp();
const db = wx.cloud.database();
const POST_DRAFT_KEY = 'postDraft';

Page({
  data: {
    content: '',
    images: [],
    type: 'share', // 默认分享类型
    submitting: false
  },

  onLoad: function() {
    this.restoreDraft();
  },

  onUnload: function() {
    if (this.skipDraftSave) return;
    if (this.draftDirty && !this.data.submitting) {
      this.saveDraft(true);
    }
  },

  restoreDraft: function() {
    const draft = wx.getStorageSync(POST_DRAFT_KEY);
    if (!draft) return;

    if (!draft.content && (!draft.images || draft.images.length === 0)) {
      return;
    }

    wx.showModal({
      title: '发现草稿',
      content: '是否恢复上次编辑内容？',
      confirmText: '恢复',
      cancelText: '放弃',
      success: (res) => {
        if (res.confirm) {
          const images = (draft.images || []).map((path) => ({
            path,
            isSaved: true
          }));
          this.setData({
            content: draft.content || '',
            images,
            type: draft.type || 'share'
          });
          this.draftDirty = false;
        } else {
          this.clearDraftFiles(draft.images || []);
          wx.removeStorageSync(POST_DRAFT_KEY);
        }
      }
    });
  },

  // 输入内容变化
  onContentInput: function(e) {
    this.setData({
      content: e.detail.value
    });
    this.draftDirty = true;
  },

  // 选择图片
  chooseImage: function() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.images.length, // 最多9张
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePaths = res.tempFilePaths || [];
        if (tempFilePaths.length === 0) return;

        that.persistImages(tempFilePaths).then((savedPaths) => {
          const images = that.data.images.concat(
            savedPaths.map((path) => ({
              path,
              isSaved: true
            }))
          );
          that.setData({ images });
          that.draftDirty = true;
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
    const removed = images.splice(index, 1)[0];
    this.setData({
      images: images
    });
    if (removed && removed.isSaved) {
      this.removeSavedFile(removed.path);
    }
    this.draftDirty = true;
  },

  // 预览图片
  previewImage: function(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.images.map((item) => item.path);
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  // 选择帖子类型
  selectType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      type: type
    });
    this.draftDirty = true;
  },

  // 提交帖子
  submitPost: function() {
    const { content, images, type, submitting } = this.data;
    
    if (submitting) return;

    const imagePaths = images.map((item) => item.path || item);
    
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

    // 显示检测中状态
    wx.showLoading({
      title: '内容检测中...',
      mask: true
    });

    // 先检测文本内容
    const textCheckResult = await wx.cloud.callFunction({
      name: 'checkContent',
      data: {
        type: 'text',
        value: content
      }
    });

    if (textCheckResult.result.code !== 0) {
      wx.hideLoading();
      wx.showToast({
        title: textCheckResult.result.msg || '内容包含违规信息',
        icon: 'none'
      });
      return;
    }

    // 检测图片内容
    if (imagePaths.length > 0) {
      for (let i = 0; i < imagePaths.length; i++) {
        const imageCheckResult = await wx.cloud.callFunction({
          name: 'checkContent',
          data: {
            type: 'image',
            value: imagePaths[i]
          }
        });

        if (imageCheckResult.result.code !== 0) {
          wx.hideLoading();
          wx.showToast({
            title: `第${i + 1}张图片${imageCheckResult.result.msg || '包含违规信息'}`,
            icon: 'none'
          });
          return;
        }
      }
    }

    wx.hideLoading();
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
        return this.uploadImages(imagePaths).then((imageUrls) => {
          return this.savePostToDatabase(content, imageUrls, type);
        });
      })
      .then(() => {
        this.clearDraft();
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
    if (this.data.submitting) return;

    if (this.hasDraftContent()) {
      wx.showActionSheet({
        itemList: ['保存草稿并退出', '放弃草稿'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.saveDraft(false);
            this.skipDraftSave = true;
            wx.navigateBack();
          } else if (res.tapIndex === 1) {
            this.clearDraft();
            wx.navigateBack();
          }
        }
      });
      return;
    }

    wx.navigateBack();
  },

  // 清空内容
  clearContent: function() {
    this.setData({
      content: '',
      images: []
    });
    this.draftDirty = true;
  },

  hasDraftContent: function() {
    return (
      (this.data.content && this.data.content.trim()) ||
      (this.data.images && this.data.images.length > 0)
    );
  },

  persistImages: function(tempPaths) {
    return Promise.all(
      tempPaths.map((path) => {
        return new Promise((resolve) => {
          wx.saveFile({
            tempFilePath: path,
            success: (res) => resolve(res.savedFilePath),
            fail: () => resolve(path)
          });
        });
      })
    );
  },

  removeSavedFile: function(path) {
    wx.removeSavedFile({
      filePath: path,
      fail: () => {}
    });
  },

  clearDraftFiles: function(paths) {
    (paths || []).forEach((path) => {
      this.removeSavedFile(path);
    });
  },

  saveDraft: function(silent) {
    const draft = {
      content: this.data.content,
      images: this.data.images.map((item) => item.path),
      type: this.data.type,
      updatedAt: Date.now()
    };

    wx.setStorageSync(POST_DRAFT_KEY, draft);

    if (!silent) {
      wx.showToast({
        title: '草稿已保存',
        icon: 'success'
      });
    }
  },

  clearDraft: function() {
    const paths = this.data.images.map((item) => item.path);
    this.clearDraftFiles(paths);
    wx.removeStorageSync(POST_DRAFT_KEY);
    this.skipDraftSave = true;
    this.draftDirty = false;
  }
})
