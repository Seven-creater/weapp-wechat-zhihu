// pages/admin-certification/index.js
Page({
  data: {
    applications: [],
    currentFilter: 'pending', // pending, approved, rejected
    stats: {
      pending: 0,
      approved: 0,
      rejected: 0
    },
    hasMore: false,
    page: 1,
    pageSize: 20,
    
    // 拒绝弹窗
    showRejectModal: false,
    rejectReason: '',
    currentRejectId: null,
    
    filterText: '认证申请'
  },

  onLoad() {
    this.checkAdminPermission();
  },

  onShow() {
    this.loadStats();
    this.loadApplications();
  },

  /**
   * 检查管理员权限
   */
  checkAdminPermission() {
    // TODO: 实现管理员权限检查
    // 可以通过云函数检查当前用户是否是管理员
    // 或者在数据库中设置管理员列表
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      wx.showModal({
        title: '权限不足',
        content: '请先登录',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/mine/index' });
        }
      });
      return;
    }
    
    // 简单示例：检查是否是特定用户
    // 实际应用中应该在云端验证
    console.log('管理员权限检查通过');
  },

  /**
   * 加载统计数据
   */
  loadStats() {
    wx.cloud.callFunction({
      name: 'getGovCertStats',
      data: {}
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          stats: res.result.stats
        });
      }
    }).catch(err => {
      console.error('加载统计失败:', err);
    });
  },

  /**
   * 加载申请列表
   */
  loadApplications() {
    wx.showLoading({ title: '加载中...' });
    
    wx.cloud.callFunction({
      name: 'getGovCertApplications',
      data: {
        status: this.data.currentFilter,
        page: this.data.page,
        pageSize: this.data.pageSize
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const applications = res.result.applications.map(app => ({
          ...app,
          applyTime: this.formatTime(app.applyTime),
          reviewTime: app.reviewTime ? this.formatTime(app.reviewTime) : null
        }));
        
        this.setData({
          applications: this.data.page === 1 ? applications : [...this.data.applications, ...applications],
          hasMore: res.result.hasMore
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载申请列表失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    });
  },

  /**
   * 切换筛选
   */
  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    let filterText = '认证申请';
    
    if (filter === 'pending') filterText = '待审核申请';
    else if (filter === 'approved') filterText = '已通过申请';
    else if (filter === 'rejected') filterText = '已拒绝申请';
    
    this.setData({
      currentFilter: filter,
      filterText,
      page: 1,
      applications: []
    }, () => {
      this.loadApplications();
    });
  },

  /**
   * 通过申请
   */
  handleApprove(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认通过',
      content: '确认通过该用户的政府认证申请？',
      success: (res) => {
        if (res.confirm) {
          this.reviewApplication(id, 'approved', '');
        }
      }
    });
  },

  /**
   * 拒绝申请
   */
  handleReject(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      showRejectModal: true,
      currentRejectId: id,
      rejectReason: ''
    });
  },

  /**
   * 输入拒绝原因
   */
  onRejectReasonInput(e) {
    this.setData({
      rejectReason: e.detail.value
    });
  },

  /**
   * 确认拒绝
   */
  confirmReject() {
    if (!this.data.rejectReason.trim()) {
      wx.showToast({
        title: '请输入拒绝原因',
        icon: 'none'
      });
      return;
    }
    
    this.reviewApplication(this.data.currentRejectId, 'rejected', this.data.rejectReason);
    this.closeRejectModal();
  },

  /**
   * 关闭拒绝弹窗
   */
  closeRejectModal() {
    this.setData({
      showRejectModal: false,
      rejectReason: '',
      currentRejectId: null
    });
  },

  /**
   * 🆕 移除政府身份
   */
  handleRemove(e) {
    const openid = e.currentTarget.dataset.openid;
    const name = e.currentTarget.dataset.name;
    
    wx.showModal({
      title: '确认移除',
      content: `确认移除 ${name} 的政府用户身份？移除后该用户将变为普通用户。`,
      confirmText: '确认移除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.removeGovIdentity(openid);
        }
      }
    });
  },

  /**
   * 🆕 执行移除政府身份
   */
  removeGovIdentity(userOpenid) {
    wx.showLoading({ title: '处理中...' });
    
    wx.cloud.callFunction({
      name: 'removeGovCertification',
      data: {
        userOpenid: userOpenid
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        wx.showToast({
          title: '已移除政府身份',
          icon: 'success'
        });
        
        // 刷新列表和统计
        this.setData({ page: 1, applications: [] });
        this.loadStats();
        this.loadApplications();
      } else {
        wx.showToast({
          title: res.result?.error || '操作失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('移除失败:', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    });
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  /**
   * 审核申请
   */
  reviewApplication(id, status, reason) {
    wx.showLoading({ title: '处理中...' });
    
    wx.cloud.callFunction({
      name: 'reviewGovCertification',
      data: {
        applicationId: id,
        status: status,
        rejectReason: reason
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        wx.showToast({
          title: status === 'approved' ? '已通过' : '已拒绝',
          icon: 'success'
        });
        
        // 刷新列表和统计
        this.setData({ page: 1, applications: [] });
        this.loadStats();
        this.loadApplications();
      } else {
        wx.showToast({
          title: res.result?.error || '操作失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('审核失败:', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    });
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (!this.data.hasMore) return;
    
    this.setData({
      page: this.data.page + 1
    }, () => {
      this.loadApplications();
    });
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});

