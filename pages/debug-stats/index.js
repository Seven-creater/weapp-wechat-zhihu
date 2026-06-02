const app = getApp();

Page({
  data: {
    sessionActive: false,
    perfMode: false,
    runId: '-',
    appVersion: '-',
    networkType: '-',
    routeCount: 0,
    sampleCount: 0,
    droppedRawSampleCount: 0,
    summaryText: '',
    reportText: '',
    blockedText: ''
  },

  onLoad() {
    this.refreshView();
  },

  onShow() {
    this.refreshView();
  },

  refreshView() {
    const snapshot = app.getPerfSnapshot();
    const perfMode = app.isPerfModeEnabled();
    if (!snapshot || !snapshot.runId) {
      this.setData({
        perfMode,
        sessionActive: false,
        runId: '-',
        appVersion: app.getMiniProgramVersion ? app.getMiniProgramVersion() : 'dev',
        networkType: '-',
        routeCount: 0,
        sampleCount: 0,
        droppedRawSampleCount: 0,
        summaryText: '暂无采样会话',
        reportText: '',
        blockedText: ''
      });
      return;
    }

    const routeSummaries = snapshot.routeSummaries || [];
    const sampleCount = routeSummaries.reduce((sum, item) => sum + (item.sampleCount || 0), 0);
    const topLines = routeSummaries
      .slice()
      .sort((a, b) => ((b.firstScreen && b.firstScreen.p95) || 0) - ((a.firstScreen && a.firstScreen.p95) || 0))
      .slice(0, 8)
      .map((item) => {
        const route = item.route || '-';
        const fs = item.firstScreen || {};
        const req = item.requests || {};
        const payload = item.payload || {};
        return `${route}
首屏 p95=${fs.p95 || 0}ms 请求=${req.total || 0} payload=${Math.round((payload.totalBytes || 0) / 1024)}KB`;
      });

    const blockedRoutes = snapshot.blockedRoutes || [];
    this.setData({
      perfMode,
      sessionActive: !snapshot.endAt,
      runId: snapshot.runId || '-',
      appVersion: snapshot.appVersion || '-',
      networkType: snapshot.networkType || '-',
      routeCount: routeSummaries.length,
      sampleCount,
      droppedRawSampleCount: snapshot.droppedRawSampleCount || 0,
      summaryText: topLines.join('\n\n') || '暂无路由样本',
      reportText: JSON.stringify({
        runId: snapshot.runId,
        appVersion: snapshot.appVersion,
        networkType: snapshot.networkType,
        routeCount: routeSummaries.length,
        sampleCount,
        droppedRawSampleCount: snapshot.droppedRawSampleCount || 0
      }, null, 2),
      blockedText: blockedRoutes.length
        ? blockedRoutes.map((item) => `${item.route} - ${item.reason || 'unknown'}`).join('\n')
        : '无'
    });
  },

  startSampling() {
    wx.showLoading({ title: '开始采样中' });
    app.startPerfSession({})
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '采样已开始', icon: 'success' });
        this.refreshView();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showModal({
          title: '开始失败',
          content: err && (err.message || err.errMsg) || 'unknown error',
          showCancel: false
        });
      });
  },

  stopSampling() {
    const snapshot = app.stopPerfSession();
    if (!snapshot) {
      wx.showToast({ title: '无采样会话', icon: 'none' });
      return;
    }
    wx.showToast({ title: '采样已结束', icon: 'success' });
    this.refreshView();
  },

  copyJSON() {
    const report = app.exportPerfReport();
    if (!report) {
      wx.showToast({ title: '无数据可复制', icon: 'none' });
      return;
    }
    const content = JSON.stringify(report, null, 2);
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: 'JSON已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  uploadSummary() {
    wx.showLoading({ title: '上传中' });
    app.uploadPerfSummary()
      .then((res) => {
        wx.hideLoading();
        wx.showModal({
          title: '上传完成',
          content: JSON.stringify(res, null, 2).slice(0, 800),
          showCancel: false
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showModal({
          title: '上传失败',
          content: err && (err.message || err.errMsg) || 'unknown error',
          showCancel: false
        });
      });
  },

  clearSession() {
    app.clearPerfSession();
    wx.showToast({ title: '已清空', icon: 'success' });
    this.refreshView();
  }
});
