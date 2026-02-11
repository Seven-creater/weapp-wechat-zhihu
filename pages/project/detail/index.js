// pages/project/detail/index.js
const app = getApp();

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
    wx.showLoading({ title: '加载中...' });
    
    const db = wx.cloud.database();
    db.collection('construction_projects')  // 使用construction_projects集合
      .doc(this.data.projectId)
      .get()
      .then(res => {
        wx.hideLoading();
        if (res.data) {
          // 格式化时间
          const project = res.data;
          if (project.stages) {
            project.stages = project.stages.map(stage => {
              if (stage.completedAt) {
                stage.completedAtFormatted = this.formatTime(stage.completedAt);
              }
              return stage;
            });
          }
          
          this.setData({
            project: project,
            loading: false
          }, () => {
            // 项目数据加载完成后再检查权限
            this.checkPermissions();
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('加载项目失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  // 检查权限
  checkPermissions: function () {
    const db = wx.cloud.database();
    const openid = wx.getStorageSync('openid') || app.globalData.openid;
    
    if (!openid) {
      console.log('用户未登录');
      return;
    }
    
    // 检查用户类型
    db.collection('users')
      .where({ _openid: openid })
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          const userType = res.data[0].userType;
          this.setData({ userType });
          
          // 社区工作者可以确认
          if (userType === 'communityWorker') {
            this.setData({ canConfirm: true });
            console.log('社区工作者，可以确认');
          }
        }
        
        // 检查是否是发帖者（在获取用户类型后）
        this.checkIfPoster(openid);
      })
      .catch(err => {
        console.error('查询用户类型失败:', err);
      });
  },

  // 检查是否是发帖者
  checkIfPoster: function (openid) {
    if (!this.data.project || !this.data.project.issueId) {
      console.log('项目数据不完整');
      return;
    }
    
    const db = wx.cloud.database();
    db.collection('posts')
      .doc(this.data.project.issueId)
      .get()
      .then(res => {
        if (res.data && res.data._openid === openid) {
          this.setData({
            isPoster: true,
            canConfirm: true
          });
          console.log('是发帖者，可以确认');
        } else {
          console.log('不是发帖者');
        }
      })
      .catch(err => {
        console.error('查询帖子失败:', err);
      });
  },

  // 跳转到施工方主页
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

