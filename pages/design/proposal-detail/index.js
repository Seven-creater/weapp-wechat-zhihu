// pages/design/proposal-detail/index.js
const app = getApp();

Page({
  data: {
    proposalId: '',
    proposal: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ proposalId: options.id });
      this.loadProposal();
    }
  },

  loadProposal() {
    wx.showLoading({ title: '加载中...' });

    const db = wx.cloud.database();
    db.collection('design_proposals')
      .doc(this.data.proposalId)
      .get()
      .then(res => {
        wx.hideLoading();
        
        if (res.data) {
          // 格式化时间
          const proposal = res.data;
          proposal.createTime = this.formatTime(proposal.createTime);
          
          this.setData({
            proposal: proposal,
            loading: false
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载方案详情失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      });
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.proposal.images
    });
  },

  // 跳转到设计师主页
  navigateToDesigner() {
    if (this.data.proposal && this.data.proposal.designerId) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${this.data.proposal.designerId}`
      });
    }
  },

  // 私信设计师
  contactDesigner() {
    if (this.data.proposal && this.data.proposal.designerId) {
      wx.navigateTo({
        url: `/pages/chat/chat?targetId=${this.data.proposal.designerId}`
      });
    } else {
      wx.showToast({
        title: '无法获取设计师信息',
        icon: 'none'
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
    const hour = String(target.getHours()).padStart(2, '0');
    const minute = String(target.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});

