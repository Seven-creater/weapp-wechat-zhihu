// pages/facility/detail/index.js
const app = getApp();

Page({
  data: {
    facilityId: '',
    facility: null,
    loading: true,
    
    // 状态选项
    statusOptions: [
      { value: 'accessible', label: '可通行', icon: '✅', color: '#10b981' },
      { value: 'blocked', label: '障碍点', icon: '🚫', color: '#ef4444' },
      { value: 'maintenance', label: '维修中', icon: '🔧', color: '#f59e0b' },
      { value: 'occupied', label: '被占用', icon: '⚠️', color: '#f97316' }
    ],
    
    // 是否可以更新状态
    canUpdate: false,
    
    // 显示更新状态面板
    showUpdatePanel: false,
    selectedNewStatus: '',
    updateNotes: '',
    updateImages: [],
    updating: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ facilityId: options.id });
      this.loadFacilityDetail();
      this.checkUpdatePermission();
    } else {
      wx.showToast({
        title: '设施不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载设施详情
  loadFacilityDetail: function () {
    wx.showLoading({ title: '加载中...' });
    
    wx.cloud.callFunction({
      name: 'getFacilities',
      data: {
        page: 1,
        pageSize: 1
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const facilities = res.result.data || [];
        const facility = facilities.find(f => f._id === this.data.facilityId);
        
        if (facility) {
          // 处理位置信息
          const coords = facility.location?.coordinates;
          if (coords && Array.isArray(coords)) {
            facility.longitude = coords[0];
            facility.latitude = coords[1];
          }
          
          // 格式化状态历史时间
          if (facility.statusHistory && Array.isArray(facility.statusHistory)) {
            facility.statusHistory = facility.statusHistory.map(record => ({
              ...record,
              updateTime: this.formatTime(record.updateTime)
            }));
          }
          
          this.setData({
            facility: facility,
            loading: false
          });
        } else {
          // 如果在列表中没找到，直接查询数据库
          this.loadFromDatabase();
        }
      } else {
        this.loadFromDatabase();
      }
    }).catch(err => {
      console.error('加载设施详情失败:', err);
      this.loadFromDatabase();
    });
  },

  // 从数据库直接加载
  loadFromDatabase: function () {
    const db = wx.cloud.database();
    
    db.collection('facilities')
      .doc(this.data.facilityId)
      .get()
      .then(res => {
        wx.hideLoading();
        
        if (res.data) {
          const facility = res.data;
          
          // 处理位置信息
          const coords = facility.location?.coordinates;
          if (coords && Array.isArray(coords)) {
            facility.longitude = coords[0];
            facility.latitude = coords[1];
          }
          
          // 格式化状态历史时间
          if (facility.statusHistory && Array.isArray(facility.statusHistory)) {
            facility.statusHistory = facility.statusHistory.map(record => ({
              ...record,
              updateTime: this.formatTime(record.updateTime)
            }));
          }
          
          this.setData({
            facility: facility,
            loading: false
          });
        } else {
          wx.showToast({
            title: '设施不存在',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载设施详情失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  // 检查更新权限
  checkUpdatePermission: function () {
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!openid) {
      this.setData({ canUpdate: false });
      return;
    }

    const db = wx.cloud.database();
    db.collection('users')
      .where({ _openid: openid })
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          const user = res.data[0];
          const userType = user.userType || 'normal';
          
          // 社区工作者可以更新所有设施
          // 设计者和普通用户可以更新自己创建的设施
          const canUpdate = 
            userType === 'communityWorker' ||
            (this.data.facility && this.data.facility._openid === openid);
          
          this.setData({ canUpdate });
        }
      })
      .catch(err => {
        console.error('检查权限失败:', err);
      });
  },

  // 格式化时间
  formatTime: function (time) {
    if (!time) return '';
    
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 获取状态信息
  getStatusInfo: function (status) {
    return this.data.statusOptions.find(s => s.value === status) || this.data.statusOptions[0];
  },

  // 预览图片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.facility.images || [];
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  // 预览历史记录图片
  previewHistoryImage: function (e) {
    const current = e.currentTarget.dataset.src;
    const images = e.currentTarget.dataset.images;
    wx.previewImage({
      current: current,
      urls: images
    });
  },

  // 导航到设施
  navigateToFacility: function () {
    if (!this.data.facility) return;
    
    wx.openLocation({
      latitude: this.data.facility.latitude,
      longitude: this.data.facility.longitude,
      name: this.data.facility.name,
      address: this.data.facility.formattedAddress || this.data.facility.address,
      scale: 18
    });
  },

  // 显示更新状态面板
  showUpdateStatusPanel: function () {
    if (!this.data.canUpdate) {
      wx.showToast({
        title: '无权限更新',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      showUpdatePanel: true,
      selectedNewStatus: this.data.facility.status,
      updateNotes: '',
      updateImages: []
    });
  },

  // 关闭更新面板
  closeUpdatePanel: function () {
    this.setData({
      showUpdatePanel: false,
      selectedNewStatus: '',
      updateNotes: '',
      updateImages: []
    });
  },

  // 选择新状态
  onNewStatusTap: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ selectedNewStatus: status });
  },

  // 输入更新备注
  onUpdateNotesInput: function (e) {
    this.setData({ updateNotes: e.detail.value });
  },

  // 选择更新照片
  chooseUpdateImage: function () {
    const currentCount = this.data.updateImages.length;
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
          updateImages: [...this.data.updateImages, ...newImages]
        });
      }
    });
  },

  // 删除更新照片
  removeUpdateImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.updateImages];
    images.splice(index, 1);
    this.setData({ updateImages: images });
  },

  // 上传更新照片
  uploadUpdateImages: function () {
    if (this.data.updateImages.length === 0) {
      return Promise.resolve([]);
    }

    const uploadPromises = this.data.updateImages.map((imagePath, index) => {
      const cloudPath = `facilities/updates/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath
      }).then(res => res.fileID);
    });

    return Promise.all(uploadPromises);
  },

  // 提交状态更新
  submitStatusUpdate: function () {
    if (!this.data.selectedNewStatus) {
      wx.showToast({
        title: '请选择状态',
        icon: 'none'
      });
      return;
    }

    if (this.data.selectedNewStatus === this.data.facility.status) {
      wx.showToast({
        title: '状态未改变',
        icon: 'none'
      });
      return;
    }

    this.setData({ updating: true });
    wx.showLoading({ title: '更新中...' });

    // 先上传照片
    this.uploadUpdateImages().then(fileIDs => {
      // 调用 updateFacilityStatus 云函数
      return wx.cloud.callFunction({
        name: 'updateFacilityStatus',
        data: {
          facilityId: this.data.facilityId,
          newStatus: this.data.selectedNewStatus,
          images: fileIDs,
          notes: this.data.updateNotes
        }
      });
    }).then(res => {
      wx.hideLoading();
      this.setData({ updating: false });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });

        // 关闭面板
        this.closeUpdatePanel();

        // 重新加载详情
        setTimeout(() => {
          this.loadFacilityDetail();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '更新失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ updating: false });
      
      console.error('更新状态失败:', err);
      wx.showToast({
        title: err.message || '更新失败',
        icon: 'none'
      });
    });
  },

  // 举报不实信息
  reportFacility: function () {
    wx.showModal({
      title: '举报不实信息',
      content: '确定要举报此设施信息不实吗？',
      confirmText: '举报',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          // TODO: 实现举报功能
          wx.showToast({
            title: '举报成功',
            icon: 'success'
          });
        }
      }
    });
  }
});

