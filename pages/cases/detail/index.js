// pages/cases/detail/index.js
const app = getApp();

Page({
  data: {
    caseId: '',
    caseData: null,
    loading: true
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ caseId: options.id });
      this.loadCaseDetail();
    }
  },

  onShareAppMessage: function () {
    return {
      title: this.data.caseData?.title || '优质案例',
      path: `/pages/cases/detail/index?id=${this.data.caseId}`
    };
  },

  // 加载案例详情
  loadCaseDetail: function () {
    wx.showLoading({ title: '加载中...' });

    const db = wx.cloud.database();
    db.collection('cases')
      .doc(this.data.caseId)
      .get()
      .then(res => {
        wx.hideLoading();

        if (res.data) {
          // 格式化日期
          const caseData = res.data;
          if (caseData.completedAt) {
            caseData.completedDate = this.formatDate(caseData.completedAt);
          }
          if (caseData.nodes) {
            caseData.nodes.forEach(node => {
              if (node.completedAt) {
                node.completedAt = this.formatDate(node.completedAt);
              }
            });
          }

          this.setData({
            caseData: caseData,
            loading: false
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载案例详情失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
  },

  // 格式化日期
  formatDate: function (date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 预览图片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  // 查看承包商主页
  viewContractor: function () {
    const contractorId = this.data.caseData?.contractorId;
    if (contractorId) {
      wx.navigateTo({
        url: `/pages/user/index?id=${contractorId}`
      });
    }
  },

  // 联系承包商
  contactContractor: function () {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});
