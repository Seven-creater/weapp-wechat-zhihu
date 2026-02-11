// pages/facility/mark/index.js
const app = getApp();

Page({
  data: {
    latitude: null,
    longitude: null,
    address: '',
    formattedAddress: '',
    detailAddress: '',
    
    // 设施类型选项
    facilityTypes: [
      '无障碍停车位',
      '无障碍卫生间',
      '无障碍坡道',
      '无障碍电梯',
      '无障碍升降台'
    ],
    selectedFacilityType: '',
    
    // 状态选项
    statusOptions: [
      { value: 'accessible', label: '可通行', icon: '✅', color: '#10b981' },
      { value: 'blocked', label: '障碍点', icon: '🚫', color: '#ef4444' },
      { value: 'maintenance', label: '维修中', icon: '🔧', color: '#f59e0b' },
      { value: 'occupied', label: '被占用', icon: '⚠️', color: '#f97316' }
    ],
    selectedStatus: '',
    
    // 设施名称
    facilityName: '',
    
    // 照片
    images: [],
    
    // 描述/备注
    description: '',
    
    // 提交状态
    submitting: false
  },

  onLoad: function (options) {
    // 从地图页面传入的位置
    if (options.latitude && options.longitude) {
      const latitude = parseFloat(options.latitude);
      const longitude = parseFloat(options.longitude);
      
      this.setData({
        latitude: latitude,
        longitude: longitude
      });
      
      // 逆地理编码获取地址
      this.reverseGeocoder(latitude, longitude);
    }
  },

  // 逆地理编码
  reverseGeocoder: function (latitude, longitude) {
    wx.showLoading({ title: '获取地址...' });
    
    // 使用腾讯地图API逆地理编码
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: {
        location: `${latitude},${longitude}`,
        key: 'QTABZ-SI5CL-JMMPF-MJMVG-AND33-UHFCE',
        get_poi: 1
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data.status === 0) {
          const result = res.data.result;
          this.setData({
            address: result.address,
            formattedAddress: result.formatted_addresses?.recommend || result.address
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        this.setData({
          formattedAddress: `位置: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        });
      }
    });
  },

  // 重新选择位置
  chooseLocation: function () {
    wx.chooseLocation({
      latitude: this.data.latitude,
      longitude: this.data.longitude,
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

  // 选择设施类型
  onFacilityTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({
      selectedFacilityType: this.data.facilityTypes[index]
    });
  },

  // 选择状态
  onStatusTap: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      selectedStatus: status
    });
  },

  // 输入设施名称
  onNameInput: function (e) {
    this.setData({
      facilityName: e.detail.value
    });
  },

  // 输入详细地址
  onDetailAddressInput: function (e) {
    this.setData({
      detailAddress: e.detail.value
    });
  },

  // 输入描述
  onDescriptionInput: function (e) {
    this.setData({
      description: e.detail.value
    });
  },

  // 选择照片
  chooseImage: function () {
    const currentCount = this.data.images.length;
    if (currentCount >= 9) {
      wx.showToast({
        title: '最多上传9张照片',
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: 9 - currentCount,
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

  // 预览照片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.images
    });
  },

  // 删除照片
  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  // 上传照片到云存储
  uploadImages: function () {
    if (this.data.images.length === 0) {
      return Promise.resolve([]);
    }

    const uploadPromises = this.data.images.map((imagePath, index) => {
      const cloudPath = `facilities/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交标注
  submitMark: function () {
    // 验证必填项
    if (!this.data.selectedFacilityType) {
      wx.showToast({
        title: '请选择设施类型',
        icon: 'none'
      });
      return;
    }

    if (!this.data.selectedStatus) {
      wx.showToast({
        title: '请选择设施状态',
        icon: 'none'
      });
      return;
    }

    if (!this.data.latitude || !this.data.longitude) {
      wx.showToast({
        title: '位置信息缺失',
        icon: 'none'
      });
      return;
    }

    // 检查登录状态
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    // 先上传照片
    this.uploadImages().then(fileIDs => {
      // 调用 createFacility 云函数
      return wx.cloud.callFunction({
        name: 'createFacility',
        data: {
          facilityType: this.data.selectedFacilityType,
          name: this.data.facilityName || this.data.selectedFacilityType,
          latitude: this.data.latitude,
          longitude: this.data.longitude,
          address: this.data.address,
          formattedAddress: this.data.formattedAddress,
          detailAddress: this.data.detailAddress,
          status: this.data.selectedStatus,
          images: fileIDs,
          description: this.data.description
        }
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '标注成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '标注失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ submitting: false });
      
      console.error('标注失败:', err);
      wx.showToast({
        title: err.message || '标注失败',
        icon: 'none'
      });
    });
  },

  // 取消
  handleCancel: function () {
    wx.navigateBack();
  }
});

