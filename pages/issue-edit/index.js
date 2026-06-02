// pages/issue-edit/index.js
const app = getApp();
const {
  ISSUE_CLASSIFICATION_SCHEMA,
  getCategoryId,
  getSubtypes,
  isValidSubtype
} = require('../../utils/issue-classification.js');

// 延迟初始化数据库
let db = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
  }
  return db;
};

const recorderManager = wx.getRecorderManager();
const MAX_UPLOAD_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_COMPRESS_QUALITIES = [80, 60, 45, 35];

function formatConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '--';
  return `${Math.round(number * 100)}%`;
}

function normalizeSelectedSubtypes(category, value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const candidates = source.concat(fallback ? [fallback] : []);
  const seen = new Set();
  const result = [];
  candidates.forEach((item) => {
    const subtype = typeof item === 'string' ? item.trim() : '';
    if (!subtype || seen.has(subtype) || !isValidSubtype(category, subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });
  return result.slice(0, 5);
}

function buildSubtypeOptions(category, selectedSubtypes) {
  const selected = new Set(Array.isArray(selectedSubtypes) ? selectedSubtypes : [selectedSubtypes].filter(Boolean));
  return getSubtypes(category).map((name) => ({
    name,
    selected: selected.has(name)
  }));
}

function buildSubtypeText(subtypes) {
  return (Array.isArray(subtypes) ? subtypes : []).join('、');
}

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
    description: '',
    images: [],
    selectedCommunity: '楠竹社区',
    communityOptions: ['楠竹社区', '和美社区'],
    recognizedCategory: '',
    recognizedSubtype: '',
    recognizedSubtypes: [],
    recognitionConfidence: 0,
    recognitionConfidenceText: '--',
    recognitionStatus: '',
    recognitionError: '',
    categoryProbabilities: {},
    subcategoryProbabilities: {},
    subtypeOptions: [],
    showSubtypePicker: false,
    matchedSchemes: [],
    schemeMessage: '暂无方案',
    contactPhone: '',
    latitude: null,
    longitude: null,
    address: '',
    formattedAddress: '',
    detailAddress: '',
    aiSolution: '',
    recognizingImage: false,
    submitting: false,
    isRecording: false,
    tempAudioPath: ''
  },

  onLoad: function (options) {
    const communityOptions = ['楠竹社区', '和美社区'];
    const selectedCommunity = options && communityOptions.includes(options.community)
      ? options.community
      : '楠竹社区';
    this.setData({
      communityOptions,
      selectedCommunity
    });
    
    // 如果从其他页面传入了图片
    if (options && options.image) {
      this.setData({
        images: [{
          path: decodeURIComponent(options.image),
          fileID: ''
        }]
      });
      this.recognizePrimaryImage();
    }
    
    // 自动获取位置
    this.chooseLocation();
    
    // 录音监听
    recorderManager.onStop((res) => {
      this.setData({
        tempAudioPath: res.tempFilePath,
        isRecording: false
      });
      this.recognizeSpeech(res.tempFilePath);
    });
  },

  onDescriptionInput: function (e) {
    this.setData({ description: e.detail.value });
  },

  onContactPhoneInput: function (e) {
    this.setData({ contactPhone: e.detail.value });
  },

  onContactPhoneBlur: function (e) {
    const phone = e.detail.value;
    // 简单的手机号验证
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
    }
  },

  onDetailAddressInput: function (e) {
    this.setData({ detailAddress: e.detail.value });
  },

  onCommunitySelect: function (e) {
    const community = e.currentTarget.dataset.community;
    if (!community || community === this.data.selectedCommunity) return;
    if (!this.data.communityOptions.includes(community)) return;
    this.setData({ selectedCommunity: community });
  },

  loadMatchedSchemes: function (category, subtypes) {
    const normalizedSubtypes = normalizeSelectedSubtypes(category, subtypes, this.data.recognizedSubtype);
    if (!category || normalizedSubtypes.length === 0) return Promise.resolve();
    this.setData({
      matchedSchemes: [],
      schemeMessage: '方案匹配中...'
    });

    return wx.cloud.callFunction({
      name: 'matchIssueSchemes',
      data: {
        recognizedCategory: category,
        recognizedSubtype: normalizedSubtypes[0],
        recognizedSubtypes: normalizedSubtypes
      }
    }).then((res) => {
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.error || '方案匹配失败');
      }
      this.setData({
        matchedSchemes: Array.isArray(result.matchedSchemes) ? result.matchedSchemes : [],
        schemeMessage: result.schemeMessage || ''
      });
    }).catch((err) => {
      console.error('[issue-edit] matchIssueSchemes failed:', err);
      this.setData({
        matchedSchemes: [],
        schemeMessage: '暂无匹配方案'
      });
    });
  },

  // 选择图片
  chooseImage: function () {
    const currentCount = this.data.images.length;
    if (currentCount >= 9) {
      wx.showToast({
        title: '最多上传9张图片',
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: 9 - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => ({
          path: file.tempFilePath,
          size: Number(file.size) || 0,
          uploadPath: '',
          uploadSize: 0,
          fileID: ''
        }));
        const shouldRecognize = this.data.images.length === 0 && newImages.length > 0;
        this.setData({
          images: [...this.data.images, ...newImages],
          ...(shouldRecognize ? this.resetRecognitionState() : {})
        }, () => {
          if (shouldRecognize) {
            this.recognizePrimaryImage();
          }
        });
      }
    });
  },

  // 预览图片
  previewImage: function (e) {
    const src = e.currentTarget.dataset.src;
    const urls = this.data.images.map(img => img.path);
    wx.previewImage({
      current: src,
      urls: urls
    });
  },

  // 删除图片
  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    const shouldReset = Number(index) === 0;
    this.setData({
      images,
      ...(shouldReset ? this.resetRecognitionState() : {})
    }, () => {
      if (shouldReset && images.length > 0) {
        this.recognizePrimaryImage();
      }
    });
  },

  resetRecognitionState: function () {
    return {
      recognizedCategory: '',
      recognizedSubtype: '',
      recognizedSubtypes: [],
      recognitionConfidence: 0,
      recognitionConfidenceText: '--',
      recognitionStatus: '',
      recognitionError: '',
      categoryProbabilities: {},
      subcategoryProbabilities: {},
      subtypeOptions: [],
      showSubtypePicker: false,
      matchedSchemes: [],
      schemeMessage: '暂无方案',
      aiSolution: ''
    };
  },

  ensureImageUploaded: function (index) {
    const image = this.data.images[index];
    if (!image || !image.path) {
      return Promise.reject(new Error('请先上传现场照片'));
    }
    if (image.fileID) {
      return Promise.resolve(image.fileID);
    }
    return this.prepareImageForUpload(index).then((preparedImage) => {
      const uploadPath = preparedImage.uploadPath || preparedImage.path;
      const cloudPath = `issues/${Date.now()}-${index}.${inferImageExt(uploadPath)}`;
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
  },

  prepareImageForUpload: function (index) {
    const image = this.data.images[index];
    if (!image || !image.path) {
      return Promise.reject(new Error('请先上传现场照片'));
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
              console.warn('[issue-edit] compress image failed:', err);
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

  recognizePrimaryImage: function () {
    if (this.data.recognizingImage) return;
    if (!this.data.images.length) {
      wx.showToast({ title: '请先上传现场照片', icon: 'none' });
      return;
    }

    this.setData({
      recognizingImage: true,
      recognitionStatus: 'pending',
      recognitionError: ''
    });
    wx.showLoading({ title: '识别中...' });

    this.ensureImageUploaded(0)
      .then((fileID) => wx.cloud.callFunction({
        name: 'classifyIssueImage',
        data: { fileID }
      }))
      .then((res) => {
        const result = res.result && res.result.data;
        if (!res.result || !res.result.success || !result) {
          throw new Error((res.result && res.result.error) || '识别失败，请重新拍摄，并对准设施主体');
        }
        this.applyRecognitionResult(result, true);
      })
      .catch((err) => {
        const message = err.message || '识别失败，请重新拍摄，并对准设施主体';
        this.setData({
          ...this.resetRecognitionState(),
          recognitionStatus: 'failed',
          recognitionError: message
        });
        console.error('[issue-edit] classifyIssueImage failed:', err);
        wx.showToast({
          title: message,
          icon: 'none'
        });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ recognizingImage: false });
      });
  },

  applyRecognitionResult: function (result, showModal) {
    const category = result.recognizedCategory || '';
    const subtypes = normalizeSelectedSubtypes(category, result.recognizedSubtypes, result.recognizedSubtype);
    if (!ISSUE_CLASSIFICATION_SCHEMA[category] || subtypes.length === 0) {
      throw new Error('识别失败，请重新拍摄，并对准设施主体');
    }
    const subtype = subtypes[0];
    const subtypeText = buildSubtypeText(subtypes);

    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    this.setData({
      recognizedCategory: category,
      recognizedSubtype: subtype,
      recognizedSubtypes: subtypes,
      recognitionConfidence: confidence,
      recognitionConfidenceText: formatConfidence(confidence),
      recognitionStatus: 'success',
      recognitionError: '',
      categoryProbabilities: result.categoryProbabilities || {},
      subcategoryProbabilities: result.subcategoryProbabilities || {},
      subtypeOptions: buildSubtypeOptions(category, subtypes),
      showSubtypePicker: false,
      aiSolution: `已识别：${category} / ${subtypeText}`,
      matchedSchemes: [],
      schemeMessage: '方案匹配中...'
    });
    this.loadMatchedSchemes(category, subtypes);

    if (showModal) {
      wx.showModal({
        title: '识别完成',
        content: `已识别：${category} / ${subtypeText}`,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  onRecognitionCategoryTap: function () {
    const now = Date.now();
    if (this._lastCategoryTapAt && now - this._lastCategoryTapAt < 450) {
      this._lastCategoryTapAt = 0;
      this.openSubtypePicker();
      return;
    }
    this._lastCategoryTapAt = now;
  },

  openSubtypePicker: function () {
    if (!this.data.recognizedCategory) return;
    this.setData({
      subtypeOptions: buildSubtypeOptions(
        this.data.recognizedCategory,
        this.data.recognizedSubtypes
      ),
      showSubtypePicker: true
    });
  },

  closeSubtypePicker: function () {
    this.setData({ showSubtypePicker: false });
    if (this._pendingSubtypeSelectionChanged) {
      this._pendingSubtypeSelectionChanged = false;
      this.loadMatchedSchemes(this.data.recognizedCategory, this.data.recognizedSubtypes);
    }
  },

  onSubtypeSelect: function (e) {
    const subtype = e.currentTarget.dataset.subtype;
    const category = this.data.recognizedCategory;
    if (!isValidSubtype(category, subtype)) return;
    const current = normalizeSelectedSubtypes(category, this.data.recognizedSubtypes, this.data.recognizedSubtype);
    const exists = current.includes(subtype);
    if (exists && current.length <= 1) {
      wx.showToast({ title: '至少保留一个子类', icon: 'none' });
      return;
    }
    if (!exists && current.length >= 5) {
      wx.showToast({ title: '最多选择5个子类', icon: 'none' });
      return;
    }
    const nextSubtypes = exists
      ? current.filter((item) => item !== subtype)
      : current.concat(subtype);
    const subtypeText = buildSubtypeText(nextSubtypes);
    this._pendingSubtypeSelectionChanged = true;
    this.setData({
      recognizedSubtype: nextSubtypes[0],
      recognizedSubtypes: nextSubtypes,
      subtypeOptions: buildSubtypeOptions(category, nextSubtypes),
      aiSolution: `已识别：${category} / ${subtypeText}`
    });
  },

  // 选择位置
  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          address: res.address,
          formattedAddress: res.name || res.address
        });
      },
      fail: (err) => {
        console.log('选择位置失败:', err);
        // 如果用户拒绝授权，尝试获取当前位置
        wx.getLocation({
          type: 'gcj02',
          success: (res) => {
            this.setData({
              latitude: res.latitude,
              longitude: res.longitude
            });
            // 逆地理编码获取地址
            this.reverseGeocoder(res.latitude, res.longitude);
          }
        });
      }
    });
  },

  // 逆地理编码
  reverseGeocoder: function (latitude, longitude) {
    // 这里可以调用腾讯地图API进行逆地理编码
    // 暂时先设置一个默认值
    this.setData({
      formattedAddress: `位置: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    });
  },

  // 开始录音
  streamRecord: function () {
    this.setData({ isRecording: true });
    
    recorderManager.start({
      duration: 60000,
      format: 'mp3'
    });
  },

  // 结束录音
  endStreamRecord: function () {
    if (this.data.isRecording) {
      recorderManager.stop();
    }
  },

  // 语音识别
  recognizeSpeech: function (audioPath) {
    wx.showLoading({ title: '识别中...' });
    
    // 调用语音识别云函数
    wx.cloud.callFunction({
      name: 'recognizeSpeech',
      data: {
        audioPath: audioPath
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const text = res.result.text || '';
        this.setData({
          description: this.data.description + text
        });
      } else {
        wx.showToast({
          title: '识别失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('语音识别失败:', err);
      wx.showToast({
        title: '识别失败',
        icon: 'none'
      });
    });
  },

  // 上传图片到云存储
  uploadImages: function () {
    return Promise.all(this.data.images.map((_, index) => this.ensureImageUploaded(index)));
  },

  // 提交问题
  submitIssue: function () {
    // 验证必填项
    if (this.data.recognizingImage) {
      wx.showToast({
        title: '图片识别中，请稍候',
        icon: 'none'
      });
      return;
    }

    if (!this.data.recognizedCategory || !this.data.recognizedSubtype || this.data.recognizedSubtypes.length === 0) {
      wx.showToast({
        title: '请先完成图片识别',
        icon: 'none'
      });
      return;
    }

    if (this.data.images.length === 0) {
      wx.showToast({
        title: '请上传至少一张现场照片',
        icon: 'none'
      });
      return;
    }

    if (!this.data.latitude || !this.data.longitude) {
      wx.showToast({
        title: '请选择位置信息',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中...' });

    this.uploadImages().then(fileIDs => {
      const description = this.data.description.trim();
      const subtypeText = buildSubtypeText(this.data.recognizedSubtypes);
      const fallbackTitle = `${this.data.recognizedCategory} / ${subtypeText}`;
      const postData = {
        title: (description || fallbackTitle).substring(0, 30),
        content: description,
        images: fileIDs,
        categoryId: getCategoryId(this.data.recognizedCategory),
        categoryName: this.data.recognizedCategory,
        recognizedCategory: this.data.recognizedCategory,
        recognizedSubtype: this.data.recognizedSubtype,
        recognizedSubtypes: this.data.recognizedSubtypes,
        recognitionConfidence: this.data.recognitionConfidence,
        categoryProbabilities: this.data.categoryProbabilities,
        subcategoryProbabilities: this.data.subcategoryProbabilities,
        community: this.data.selectedCommunity,
        location: {
          latitude: this.data.latitude,
          longitude: this.data.longitude
        },
        address: this.data.address,
        formattedAddress: this.data.formattedAddress,
        detailAddress: this.data.detailAddress,
        aiSolution: this.data.aiSolution,
        contactPhone: this.data.contactPhone,
      };

      return wx.cloud.callFunction({
        name: 'createIssuePost',
        data: postData
      }).then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || '发布失败');
        }
        return res;
      });
    }).then(() => {
      wx.hideLoading();
      this.setData({ submitting: false });
      const openid = app.globalData.openid || wx.getStorageSync('openid');
      if (openid) {
        wx.setStorageSync(`profilePostsDirtyAt:${openid}`, Date.now());
      }
      
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error('发布失败:', err);
      wx.showToast({
        title: err.message || '发布失败',
        icon: 'none'
      });
    });
  },

  // 取消
  handleCancel: function () {
    wx.navigateBack();
  }
});
