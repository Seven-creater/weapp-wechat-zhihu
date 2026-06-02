const app = getApp();

const MAX_IMAGE_COUNT = 5;
const MAX_UPLOAD_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_COMPRESS_QUALITIES = [80, 60, 45, 35];

function getLocalFileSize(filePath) {
  return new Promise((resolve) => {
    if (!filePath || !wx.getFileInfo) {
      resolve(0);
      return;
    }
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(0)
    });
  });
}

function compressLocalImage(filePath, quality) {
  return new Promise((resolve, reject) => {
    if (!wx.compressImage) {
      reject(new Error('wx.compressImage unavailable'));
      return;
    }
    wx.compressImage({
      src: filePath,
      quality,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: reject
    });
  });
}

function inferImageExt(filePath) {
  const match = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const rawExt = match ? match[1].toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
}

Page({
  data: {
    title: '',
    content: '',
    images: [],
    communityOptions: ['楠竹社区', '和美社区'],
    selectedCommunity: '楠竹社区',
    urgencyOptions: [
      { value: 'high', label: '高', desc: '尽快处理' },
      { value: 'medium', label: '中', desc: '尽快处理' },
      { value: 'low', label: '低', desc: '可协调安排' }
    ],
    urgency: 'medium',
    latitude: null,
    longitude: null,
    address: '',
    formattedAddress: '',
    detailAddress: '',
    contactPhone: '',
    submitting: false
  },

  onLoad(options) {
    if (options && this.data.communityOptions.includes(options.community)) {
      this.setData({ selectedCommunity: options.community });
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onDetailAddressInput(e) {
    this.setData({ detailAddress: e.detail.value });
  },

  onContactPhoneInput(e) {
    this.setData({ contactPhone: e.detail.value });
  },

  selectCommunity(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.communityOptions.includes(value)) {
      this.setData({ selectedCommunity: value });
    }
  },

  selectUrgency(e) {
    const value = e.currentTarget.dataset.value;
    if (['high', 'medium', 'low'].includes(value)) {
      this.setData({ urgency: value });
    }
  },

  chooseImage() {
    const currentCount = this.data.images.length;
    if (currentCount >= MAX_IMAGE_COUNT) {
      wx.showToast({ title: '最多上传5张图片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: MAX_IMAGE_COUNT - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map((file) => ({
          path: file.tempFilePath,
          size: Number(file.size) || 0,
          uploadPath: '',
          uploadSize: 0,
          fileID: ''
        }));
        this.setData({ images: this.data.images.concat(newImages) });
      }
    });
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current,
      urls: this.data.images.map((item) => item.path)
    });
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          address: res.address,
          formattedAddress: res.name || res.address
        });
      }
    });
  },

  prepareImageForUpload(index) {
    const image = this.data.images[index];
    if (!image || !image.path) {
      return Promise.reject(new Error('图片不存在'));
    }
    if (image.uploadPath) {
      return Promise.resolve(image);
    }

    return getLocalFileSize(image.path).then((detectedSize) => {
      const originalSize = Number(image.size) || detectedSize || 0;
      if (originalSize > 0 && originalSize <= MAX_UPLOAD_IMAGE_BYTES) {
        const images = this.data.images.slice();
        images[index] = {
          ...images[index],
          size: originalSize,
          uploadPath: image.path,
          uploadSize: originalSize
        };
        this.setData({ images });
        return images[index];
      }

      let bestPath = image.path;
      let bestSize = originalSize;
      let chain = Promise.resolve();
      IMAGE_COMPRESS_QUALITIES.forEach((quality) => {
        chain = chain.then(() => {
          if (bestSize > 0 && bestSize <= MAX_UPLOAD_IMAGE_BYTES) return null;
          return compressLocalImage(image.path, quality)
            .then((compressedPath) => getLocalFileSize(compressedPath)
              .then((compressedSize) => {
                const isSmaller = compressedSize > 0 && (!bestSize || compressedSize < bestSize);
                if (isSmaller) {
                  bestPath = compressedPath;
                  bestSize = compressedSize;
                }
              }))
            .catch((err) => {
              console.warn('[demand-create] compress image failed:', err);
            });
        });
      });

      return chain.then(() => {
        const images = this.data.images.slice();
        images[index] = {
          ...images[index],
          size: originalSize,
          uploadPath: bestPath,
          uploadSize: bestSize || originalSize,
          compressed: bestPath !== image.path
        };
        this.setData({ images });
        return images[index];
      });
    });
  },

  uploadImages() {
    return Promise.all(this.data.images.map((_, index) => {
      const image = this.data.images[index];
      if (image.fileID) return Promise.resolve(image.fileID);
      return this.prepareImageForUpload(index).then((prepared) => {
        const uploadPath = prepared.uploadPath || prepared.path;
        const cloudPath = `demands/${Date.now()}-${index}.${inferImageExt(uploadPath)}`;
        return wx.cloud.uploadFile({
          cloudPath,
          filePath: uploadPath
        }).then((res) => {
          const images = this.data.images.slice();
          images[index] = {
            ...images[index],
            fileID: res.fileID
          };
          this.setData({ images });
          return res.fileID;
        });
      });
    }));
  },

  validateForm() {
    if (!this.data.title.trim()) return '请输入标题';
    if (!this.data.content.trim()) return '请输入问题描述';
    if (!this.data.images.length) return '请上传至少一张图片';
    if (!this.data.latitude || !this.data.longitude) return '请选择位置';
    if (!this.data.selectedCommunity) return '请选择社区';
    if (!this.data.urgency) return '请选择紧急程度';
    return '';
  },

  submitDemand() {
    const error = this.validateForm();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    this.uploadImages()
      .then((fileIDs) => wx.cloud.callFunction({
        name: 'createDemandPost',
        data: {
          title: this.data.title,
          content: this.data.content,
          images: fileIDs,
          community: this.data.selectedCommunity,
          location: {
            latitude: this.data.latitude,
            longitude: this.data.longitude
          },
          address: this.data.address,
          formattedAddress: this.data.formattedAddress,
          detailAddress: this.data.detailAddress,
          urgency: this.data.urgency,
          contactPhone: this.data.contactPhone
        }
      }))
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.error) || '提交失败');
        }
        const openid = app.globalData.openid || wx.getStorageSync('openid');
        if (openid) {
          wx.setStorageSync(`profilePostsDirtyAt:${openid}`, Date.now());
        }
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/post-detail/index?id=${res.result.postId}`
          });
        }, 800);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
      });
  }
});
