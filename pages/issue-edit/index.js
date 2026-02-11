// pages/issue-edit/index.js
const app = getApp();
const { getAllCategories } = require('../../utils/categories.js');

// 延迟初始化数据库
let db = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
  }
  return db;
};

const recorderManager = wx.getRecorderManager();

Page({
  data: {
    description: '',
    userSuggestion: '',
    images: [],
    selectedCategory: '',
    selectedCategoryId: '',  // 新增：保存分类ID
    categoryOptions: [],  // 将在onLoad中初始化
    contactPhone: '',
    latitude: null,
    longitude: null,
    address: '',
    formattedAddress: '',
    detailAddress: '',
    aiSolution: '',
    generatingAI: false,
    submitting: false,
    isRecording: false,
    tempAudioPath: ''
  },

  onLoad: function (options) {
    // 初始化分类选项
    const categories = getAllCategories();
    this.setData({
      categoryOptions: categories
    });
    
    // 如果从其他页面传入了图片
    if (options && options.image) {
      this.setData({
        images: [{
          path: decodeURIComponent(options.image)
        }]
      });
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

  onSuggestionInput: function (e) {
    this.setData({ userSuggestion: e.detail.value });
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

  onAiSolutionInput: function (e) {
    this.setData({ aiSolution: e.detail.value });
  },

  onCategorySelect: function (e) {
    const category = e.currentTarget.dataset.category;
    const categoryId = e.currentTarget.dataset.id;
    this.setData({ 
      selectedCategory: category,
      selectedCategoryId: categoryId
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
          path: file.tempFilePath
        }));
        this.setData({
          images: [...this.data.images, ...newImages]
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
    this.setData({ images });
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

  // 生成AI方案
  generateAISolution: function () {
    if (this.data.images.length === 0) {
      wx.showToast({
        title: '请先上传现场照片',
        icon: 'none'
      });
      return;
    }

    if (!this.data.description.trim()) {
      wx.showToast({
        title: '请先填写问题描述',
        icon: 'none'
      });
      return;
    }

    this.setData({ generatingAI: true });
    wx.showLoading({ title: 'AI分析中...' });

    // 先上传图片到云存储
    this.uploadImages().then(fileIDs => {
      // TODO: 调用团队训练的AI大模型接口
      // 接口预留位置
      // return wx.cloud.callFunction({
      //   name: 'callAIModel',
      //   data: {
      //     imageUrl: fileIDs[0],
      //     description: this.data.description,
      //     location: {
      //       latitude: this.data.latitude,
      //       longitude: this.data.longitude,
      //       address: this.data.address
      //     }
      //   }
      // });

      // 暂时返回假数据模拟AI分析结果
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            result: {
              success: true,
              // 使用用户选择的分类，而不是硬编码
              category: this.data.selectedCategory || '无障碍坡道',
              budget: 5000,  // AI估算的预算
              description: `根据图片分析，建议安装坡度为1:12的${this.data.selectedCategory || '无障碍设施'}，长度约6米，配备防滑材料和扶手。`
            }
          });
        }, 2000);
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ generatingAI: false });
      
      if (res.result && res.result.success) {
        const aiResult = res.result;
        
        // 只在用户没有选择分类时，才使用AI识别的分类
        if (aiResult.category && !this.data.selectedCategory) {
          this.setData({
            selectedCategory: aiResult.category
          });
        }
        
        // 设置AI生成的方案描述
        this.setData({
          aiSolution: aiResult.description || '暂无AI分析结果'
        });

        // TODO: 调用淘宝开放平台API获取预算
        // 接口预留位置
        // this.getBudgetEstimate(aiResult.category);

        wx.showToast({
          title: 'AI分析完成',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: 'AI分析失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ generatingAI: false });
      console.error('AI分析失败:', err);
      wx.showToast({
        title: 'AI分析失败',
        icon: 'none'
      });
    });
  },

  // 获取预算估算（淘宝开放平台API）
  getBudgetEstimate: function (category) {
    // TODO: 调用淘宝开放平台API
    // 接口预留位置
    // wx.request({
    //   url: 'https://eco.taobao.com/router/rest',
    //   data: {
    //     method: 'taobao.item.price.get',
    //     app_key: 'YOUR_APP_KEY',
    //     category: category,
    //     location: this.data.address
    //   },
    //   success: (res) => {
    //     const budget = res.data.estimatedCost;
    //     // 更新预算显示
    //   }
    // });

    // 暂时使用假数据
    console.log('预算API预留位置，分类:', category);
  },

  // 上传图片到云存储
  uploadImages: function () {
    const uploadPromises = this.data.images.map((img, index) => {
      const cloudPath = `issues/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: img.path
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交问题
  submitIssue: function () {
    // 验证必填项
    if (!this.data.description.trim()) {
      wx.showToast({
        title: '请填写问题说明',
        icon: 'none'
      });
      return;
    }

    if (!this.data.selectedCategory) {
      wx.showToast({
        title: '请选择分类',
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

    // 直接创建帖子，不需要先创建issues记录
    this.uploadImages().then(fileIDs => {
      const db = getDB();
      
      // 从缓存获取用户信息
      const cachedUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
      const cachedUserType = app.globalData.userType || wx.getStorageSync('userType') || 'resident';
      
      const postData = {
        type: 'issue',  // 问题帖类型
        status: 'pending',  // 待处理状态
        title: this.data.description.substring(0, 30),
        content: this.data.description,
        images: fileIDs,
        category: this.data.selectedCategoryId,  // 保存分类ID
        categoryName: this.data.selectedCategory,  // 保存分类名称
        location: new db.Geo.Point(this.data.longitude, this.data.latitude),
        address: this.data.address,
        formattedAddress: this.data.formattedAddress,
        detailAddress: this.data.detailAddress,
        userSuggestion: this.data.userSuggestion,
        aiSolution: this.data.aiSolution,  // AI生成的方案
        contactPhone: this.data.contactPhone,
        userInfo: {
          nickName: cachedUserInfo.nickName || '微信用户',
          avatarUrl: cachedUserInfo.avatarUrl || '/images/zhi.png'
        },
        userType: cachedUserType,
        stats: {
          like: 0,
          comment: 0,
          collect: 0,
          view: 0
        },
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };

      return db.collection('posts').add({ data: postData });
    }).then(() => {
      wx.hideLoading();
      this.setData({ submitting: false });
      
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

