// pages/cases/index/index.js
const app = getApp();

Page({
  data: {
    categories: [
      { id: 'all', name: '全部' },
      { id: 'water', name: '水电改造' },
      { id: 'wall', name: '墙面翻新' },
      { id: 'floor', name: '地面铺设' },
      { id: 'furniture', name: '家具安装' },
      { id: 'other', name: '其他工程' }
    ],
    currentCategory: 'all',
    
    cases: [],
    loading: true,
    page: 1,
    hasMore: true
  },

  onLoad: function () {
    this.loadCases();
  },

  onPullDownRefresh: function () {
    this.setData({
      page: 1,
      cases: [],
      hasMore: true
    });
    this.loadCases().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCases();
    }
  },

  // 切换分类
  switchCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.currentCategory) return;

    this.setData({
      currentCategory: category,
      page: 1,
      cases: [],
      hasMore: true
    });
    this.loadCases();
  },

  // 加载案例
  loadCases: function () {
    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });

    return wx.cloud.callFunction({
      name: 'getCases',
      data: {
        category: this.data.currentCategory === 'all' ? null : this.data.currentCategory,
        page: this.data.page,
        pageSize: 10
      }
    }).then(res => {
      if (res.result && res.result.success) {
        const newCases = (res.result.data || []).map(item => {
          // 格式化日期
          if (item.completedAt) {
            const date = new Date(item.completedAt);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            item.completedDate = `${year}-${month}-${day}`;
          }
          return item;
        });

        this.setData({
          cases: this.data.page === 1 ? newCases : [...this.data.cases, ...newCases],
          hasMore: newCases.length >= 10,
          page: this.data.page + 1,
          loading: false
        });
      } else {
        throw new Error(res.result?.error || '加载失败');
      }
    }).catch(err => {
      console.error('加载案例失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    });
  },

  // 查看案例详情
  viewCase: function (e) {
    const caseId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/cases/detail/index?id=${caseId}`
    });
  }
});

