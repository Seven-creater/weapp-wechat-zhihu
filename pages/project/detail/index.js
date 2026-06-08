// pages/project/detail/index.js
const app = getApp();
const mediaUtil = require('../../../utils/cloud-media.js');

Page({
  data: {
    projectId: '',
    project: null,
    canConfirm: false,
    userType: '',
    isPoster: false,
    loading: true
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ projectId: options.id });
      this.loadProject();
    }
  },

  onShow: function () {
    if (this.data.projectId) {
      this.loadProject();
    }
  },

  // 加载项目详情
  loadProject: function () {
    wx.showLoading({ title: '???...' });

    wx.cloud.callFunction({
      name: 'getConstructionProjectDetail',
      data: { projectId: this.data.projectId }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || '????');
      }
      return this.resolveMedia(payload.data.project).then((project) => ({
        project,
        permissions: payload.data.permissions || {}
      }));
    }).then(({ project, permissions }) => {
      wx.hideLoading();
      if (project.stages) {
        project.stages = project.stages.map((stage) => {
          if (stage.completedAt) {
            stage.completedAtFormatted = this.formatTime(stage.completedAt);
          }
          return stage;
        });
      }
      this.setData({
        project,
        loading: false,
        canConfirm: !!permissions.canConfirm,
        userType: permissions.userType || '',
        isPoster: !!permissions.isPoster
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('??????:', err);
      wx.showToast({
        title: err.message || '????',
        icon: 'none'
      });
      this.setData({ loading: false });
    });
  },

  checkPermissions: function () {},

  checkIfPoster: function () {},

  navigateToContractor: function () {
    if (!this.data.project || !this.data.project.contractorId) {
      wx.showToast({
        title: '施工方信息不存在',
        icon: 'none'
      });
      return;
    }
    
    console.log('跳转到施工方主页, contractorId:', this.data.project.contractorId);
    
    wx.navigateTo({
      url: `/pages/user-profile/index?id=${this.data.project.contractorId}`
    });
  },

  // 预览图片
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    const images = e.currentTarget.dataset.images;
    wx.previewImage({
      current: current,
      urls: images
    });
  },

  // 更新节点
  updateNode: function (e) {
    const nodeIndex = e.currentTarget.dataset.index;
    wx.navigateTo({
      url: `/pages/project/update/index?projectId=${this.data.projectId}&nodeIndex=${nodeIndex}`
    });
  },

  // 确认完成
  confirmCompletion: function () {
    // 检查所有节点是否完成
    const allCompleted = this.data.project.stages.every(stage => stage.status === 'completed');
    
    if (!allCompleted) {
      wx.showToast({
        title: '请先完成所有节点',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认项目完成',
      content: '确认后项目将移入案例板块，确定吗？',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          this.submitConfirmation();
        }
      }
    });
  },

  // 提交确认
  submitConfirmation: function () {
    wx.showLoading({ title: '确认中...' });
    
    const confirmedBy = this.data.userType === 'communityWorker' ? 'communityWorker' : 'owner';
    
    wx.cloud.callFunction({
      name: 'confirmProjectCompletion',
      data: {
        projectId: this.data.projectId,
        postId: this.data.project.issueId,
        confirmedBy: confirmedBy
      }
    }).then(res => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        wx.showToast({
          title: '确认成功',
          icon: 'success'
        });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result?.error || '确认失败');
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('确认失败:', err);
      wx.showToast({
        title: err.message || '确认失败',
        icon: 'none'
      });
    });
  },

  // 格式化时间
  resolveMedia: async function (doc) {
    const cloudIds = mediaUtil.collectCloudFileIdsDeep(doc);
    if (!cloudIds || cloudIds.size === 0) {
      return doc;
    }
    const mapping = await mediaUtil.resolveTempUrlMap(Array.from(cloudIds));
    return mediaUtil.replaceCloudUrlsDeep(doc, mapping);
  },

  formatTime: function (time) {
    if (!time) return '';
    
    let date;
    if (time instanceof Date) {
      date = time;
    } else if (typeof time === 'object' && time.$date) {
      // 云数据库的 serverDate 格式
      date = new Date(time.$date);
    } else if (typeof time === 'string' || typeof time === 'number') {
      date = new Date(time);
    } else {
      return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});
