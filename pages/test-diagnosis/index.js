// pages/test-diagnosis/index.js
Page({
  data: {
    diagnosisResult: '诊断页面已从生产版本下线。',
    isRunning: false,
  },

  onLoad: function () {
    this.setData({
      diagnosisResult: '诊断页面已从生产版本下线。'
    });
  },

  startDiagnosis: function () {
    wx.showToast({
      title: '诊断功能已下线',
      icon: 'none'
    });
  },

  copyResult: function () {
    wx.setClipboardData({
      data: this.data.diagnosisResult,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success',
        });
      },
    });
  },

  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/index',
    });
  },
});
