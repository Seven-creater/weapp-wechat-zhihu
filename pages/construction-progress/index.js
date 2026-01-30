// pages/construction-progress/index.js
const app = getApp();
const constructionTeam = require("../../utils/construction-team.js");

// 延迟初始化数据库
let db = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
  }
  return db;
};

Page({
  data: {
    projectId: '',
    project: null,
    team: null,
    loading: false,
    canUpdate: false, // 是否可以更新进度（施工方权限）
    canReview: false, // 是否可以评价（业主权限）
    
    // 进度更新表单
    showUpdateForm: false,
    updateForm: {
      progress: 0,
      milestone: '',
      notes: '',
      photos: [],
    },
    
    // 评价表单
    showReviewForm: false,
    reviewForm: {
      rating: 5,
      quality: 5,
      timeliness: 5,
      communication: 5,
      professionalism: 5,
      comment: '',
      photos: [],
    },
  },

  onLoad: function (options) {
    const projectId = options.id || options.projectId;
    if (projectId) {
      this.setData({ projectId });
      this.loadProjectDetails(projectId);
    }
  },

  onShow: function () {
    if (this.data.projectId) {
      this.loadProjectDetails(this.data.projectId);
    }
  },

  // 加载项目详情
  loadProjectDetails: function (projectId) {
    this.setData({ loading: true });

    const db = getDB();
    const openid = app.globalData.openid || wx.getStorageSync('openid');

    db.collection('construction_projects')
      .doc(projectId)
      .get()
      .then(res => {
        const project = res.data;
        
        if (!project) {
          throw new Error('项目不存在');
        }

        this.setData({ project });

        // 判断权限
        const canUpdate = project.teamId && project.team_openid === openid;
        const canReview = project._openid === openid && project.status === 'completed' && !project.reviewed;

        this.setData({ canUpdate, canReview });

        // 加载施工团队信息
        if (project.teamId) {
          return constructionTeam.getTeamDetails(project.teamId);
        }
        return null;
      })
      .then(team => {
        if (team) {
          this.setData({ team });
        }
      })
      .catch(err => {
        console.error('加载项目详情失败:', err);
        wx.showToast({
          title: err.message || '加载失败',
          icon: 'none',
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  // 显示进度更新表单
  showUpdateProgressForm: function () {
    this.setData({
      showUpdateForm: true,
      'updateForm.progress': this.data.project.progress || 0,
    });
  },

  // 隐藏进度更新表单
  hideUpdateForm: function () {
    this.setData({ showUpdateForm: false });
  },

  // 进度滑块变化
  onProgressChange: function (e) {
    this.setData({
      'updateForm.progress': e.detail.value,
    });
  },

  // 里程碑输入
  onMilestoneInput: function (e) {
    this.setData({
      'updateForm.milestone': e.detail.value,
    });
  },

  // 备注输入
  onNotesInput: function (e) {
    this.setData({
      'updateForm.notes': e.detail.value,
    });
  },

  // 选择进度照片
  chooseProgressPhotos: function () {
    wx.chooseImage({
      count: 9 - this.data.updateForm.photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const photos = this.data.updateForm.photos.concat(res.tempFilePaths);
        this.setData({
          'updateForm.photos': photos,
        });
      },
    });
  },

  // 删除进度照片
  removeProgressPhoto: function (e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.updateForm.photos;
    photos.splice(index, 1);
    this.setData({
      'updateForm.photos': photos,
    });
  },

  // 提交进度更新
  submitProgressUpdate: function () {
    const { progress, milestone, notes, photos } = this.data.updateForm;

    if (!milestone) {
      wx.showToast({
        title: '请填写里程碑描述',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    // 上传照片
    const uploadPromises = photos.map((photo, index) => {
      const cloudPath = `construction/${this.data.projectId}/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath,
        filePath: photo,
      }).then(res => res.fileID);
    });

    Promise.all(uploadPromises)
      .then(fileIDs => {
        return constructionTeam.updateConstructionProgress(this.data.projectId, {
          progress,
          milestone,
          notes,
          photos: fileIDs,
        });
      })
      .then(success => {
        wx.hideLoading();
        if (success) {
          wx.showToast({
            title: '更新成功',
            icon: 'success',
          });
          this.setData({
            showUpdateForm: false,
            'updateForm.milestone': '',
            'updateForm.notes': '',
            'updateForm.photos': [],
          });
          this.loadProjectDetails(this.data.projectId);
        } else {
          throw new Error('更新失败');
        }
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({
          title: err.message || '更新失败',
          icon: 'none',
        });
      });
  },

  // 显示评价表单
  showReviewFormModal: function () {
    this.setData({ showReviewForm: true });
  },

  // 隐藏评价表单
  hideReviewForm: function () {
    this.setData({ showReviewForm: false });
  },

  // 评分变化
  onRatingChange: function (e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`reviewForm.${field}`]: e.detail.value,
    });
  },

  // 评价内容输入
  onCommentInput: function (e) {
    this.setData({
      'reviewForm.comment': e.detail.value,
    });
  },

  // 选择评价照片
  chooseReviewPhotos: function () {
    wx.chooseImage({
      count: 9 - this.data.reviewForm.photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const photos = this.data.reviewForm.photos.concat(res.tempFilePaths);
        this.setData({
          'reviewForm.photos': photos,
        });
      },
    });
  },

  // 删除评价照片
  removeReviewPhoto: function (e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.reviewForm.photos;
    photos.splice(index, 1);
    this.setData({
      'reviewForm.photos': photos,
    });
  },

  // 提交评价
  submitReview: function () {
    const { rating, quality, timeliness, communication, professionalism, comment, photos } = this.data.reviewForm;

    if (!comment) {
      wx.showToast({
        title: '请填写评价内容',
        icon: 'none',
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    // 上传照片
    const uploadPromises = photos.map((photo, index) => {
      const cloudPath = `reviews/${this.data.projectId}/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath,
        filePath: photo,
      }).then(res => res.fileID);
    });

    Promise.all(uploadPromises)
      .then(fileIDs => {
        return constructionTeam.submitTeamReview(
          this.data.projectId,
          this.data.project.teamId,
          {
            rating,
            quality,
            timeliness,
            communication,
            professionalism,
            comment,
            photos: fileIDs,
          }
        );
      })
      .then(success => {
        wx.hideLoading();
        if (success) {
          wx.showToast({
            title: '评价成功',
            icon: 'success',
          });
          this.setData({ showReviewForm: false });
          this.loadProjectDetails(this.data.projectId);
        } else {
          throw new Error('评价失败');
        }
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({
          title: err.message || '评价失败',
          icon: 'none',
        });
      });
  },

  // 预览照片
  previewPhoto: function (e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current: url,
      urls: urls || [url],
    });
  },

  // 联系施工方
  contactTeam: function () {
    if (this.data.team && this.data.team.phone) {
      wx.makePhoneCall({
        phoneNumber: this.data.team.phone,
      });
    }
  },

  // 查看团队详情
  viewTeamDetails: function () {
    if (this.data.project && this.data.project.teamId) {
      wx.navigateTo({
        url: `/pages/team-detail/index?id=${this.data.project.teamId}`,
      });
    }
  },
});









