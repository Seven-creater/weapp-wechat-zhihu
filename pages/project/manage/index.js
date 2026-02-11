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
    
    const db = wx.cloud.database();
    const openid = wx.getStorageSync('openid') || app.globalData.openid;
    
    // 根据activeTab确定查询条件
    let statusCondition;
    if (this.data.activeTab === 'active') {
      // 进行中的项目：preparing, constructing, accepting
      statusCondition = db.command.in(['preparing', 'constructing', 'accepting']);
    } else {
      // 已完成的项目
      statusCondition = 'completed';
    }
    
    db.collection('issues')  // 使用issues集合
      .where({
        contractorId: openid,
        status: statusCondition
      })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        this.setData({
          projects: res.data || [],
          loading: false
        });
      })
      .catch(err => {
        console.error('加载项目失败:', err);
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  // 查看项目详情
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

