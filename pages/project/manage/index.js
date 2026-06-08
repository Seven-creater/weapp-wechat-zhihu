// pages/project/manage/index.js
const app = getApp();

Page({
  data: {
    projects: [],
    loading: false,
    activeTab: 'active' // active | completed
  },

  onLoad: function () {
    this.loadProjects();
  },

  onShow: function () {
    this.loadProjects();
  },

  // 切换标签
  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab }, () => {
      this.loadProjects();
    });
  },

  // 加载项目列表
  loadProjects: function () {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'getMyProjectList',
      data: { tab: this.data.activeTab }
    }).then((res) => {
      const payload = res.result || {};
      if (!payload.success) {
        throw new Error(payload.error || 'query failed');
      }
      this.setData({
        projects: payload.data || [],
        loading: false
      });
    }).catch(err => {
      console.error('??????:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '????',
        icon: 'none'
      });
    });
  },

  viewProject: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/project/detail/index?id=${id}`
    });
  },

  // 更新进度
  updateProgress: function (e) {
    const id = e.currentTarget.dataset.id;
    const nodeIndex = e.currentTarget.dataset.node;
    wx.navigateTo({
      url: `/pages/project/update/index?projectId=${id}&nodeIndex=${nodeIndex}`
    });
  },

  // 格式化时间
  formatTime: function (time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 计算进度百分比
  getProgress: function (currentNode) {
    return ((currentNode + 1) / 3 * 100).toFixed(0);
  }
});

