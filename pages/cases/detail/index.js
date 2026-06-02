// pages/cases/detail/index.js
const app = getApp();
const mediaUtil = require('../../../utils/cloud-media.js');

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
          this.resolveMedia(res.data)
            .then((caseData) => {
              if (caseData.completedAt) {
                caseData.completedDate = this.formatDate(caseData.completedAt);
              }
              if (caseData.nodes) {
                caseData.nodes.forEach((node) => {
                  if (node.completedAt) {
                    node.completedAt = this.formatDate(node.completedAt);
                  }
                });
              }

              this.setData({
                caseData,
                loading: false
              });
            })
            .catch(() => {
              const caseData = res.data;
              if (caseData.completedAt) {
                caseData.completedDate = this.formatDate(caseData.completedAt);
              }
              if (caseData.nodes) {
                caseData.nodes.forEach((node) => {
                  if (node.completedAt) {
                    node.completedAt = this.formatDate(node.completedAt);
                  }
                });
              }

              this.setData({
                caseData,
                loading: false
              });
            });
          return;
        }

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
  resolveMedia: async function (doc) {
    const cloudIds = mediaUtil.collectCloudFileIdsDeep(doc);
    if (!cloudIds || cloudIds.size === 0) {
      return doc;
    }
    const mapping = await mediaUtil.resolveTempUrlMap(Array.from(cloudIds));
    return mediaUtil.replaceCloudUrlsDeep(doc, mapping);
  },

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
        url: `/pages/user-profile/index?id=${contractorId}`,
        fail: (err) => {
          console.error('跳转承包商主页失败:', err);
          wx.showToast({
            title: '页面不存在或已下线',
            icon: 'none'
          });
          setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack({ delta: 1 });
              return;
            }
            wx.switchTab({ url: '/pages/index/index' });
          }, 300);
        }
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
