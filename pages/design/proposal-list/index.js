// pages/design/proposal-list/index.js
const app = getApp();

Page({
  data: {
    issueId: '',
    proposals: [],
    loading: true
  },

  onLoad(options) {
    if (options.issueId) {
      this.setData({ issueId: options.issueId });
      this.loadProposals();
    }
  },

  loadProposals() {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'getDesignProposals',
      data: { issueId: this.data.issueId }
    }).then(res => {
      wx.hideLoading();

      if (res.result && res.result.success) {
        // 格式化时间
        const proposals = res.result.data.map(item => {
          item.createTime = this.formatTime(item.createTime);
          return item;
        });
        
        this.setData({
          proposals: proposals,
          loading: false
        });
      } else {
        throw new Error(res.result?.error || '加载失败');
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载设计方案失败:', err);
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    });
  },

  // 查看方案详情
  viewProposal(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/design/proposal-detail/index?id=${id}`
    });
  },

  // 跳转到设计师主页
  navigateToDesigner(e) {
    e.stopPropagation(); // 阻止事件冒泡，避免触发卡片点击
    const designerId = e.currentTarget.dataset.id;
    if (designerId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${designerId}`
      });
    }
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return '';
    
    let target;
    if (date instanceof Date) {
      target = date;
    } else if (typeof date === 'number') {
      target = new Date(date);
    } else if (typeof date === 'string') {
      target = new Date(date);
    } else if (date.$date) {
      target = new Date(date.$date);
    } else {
      return '';
    }

    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
});

