Page({
  data: {
    community: '',
    loading: true,
    error: '',
    generatedAt: '',
    stats: null,
    overviewCards: [],
    issueTypeStats: [],
    riskRows: [],
    budgetStats: [],
    heatmapPoints: [],
    heatmapImagePath: '',
    heatmapReady: false,
    hasHeatmapPoints: false,
    typicalIssues: [],
    schemeRecommendations: [],
    reportSections: [],
    reportText: '',
    htmlReportUrl: '',
    htmlReportFileID: '',
    htmlReportError: '',
    aiStatus: '',
    aiErrorType: '',
    aiErrorMessage: '',
    aiFallback: false
  },

  onLoad(options = {}) {
    const community = decodeURIComponent(options.community || '');
    this.setData({ community });
    this.loadReport(community);
  },

  loadReport(community) {
    if (!community) {
      this.setData({
        loading: false,
        error: '缺少社区名称'
      });
      return;
    }

    this.setData({
      loading: true,
      error: '',
      heatmapImagePath: '',
      heatmapReady: false
    });
    wx.cloud.callFunction({
      name: 'generateCommunityReport',
      data: { community }
    }).then((res) => {
      const result = res && res.result;
      if (!result || !result.success) {
        throw new Error((result && result.error) || '社区报告生成失败');
      }
      const normalized = this.normalizeReportResult(result);
      this.setData(normalized, () => {
        this.drawHeatmap(normalized.heatmapPoints);
      });
    }).catch((err) => {
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '社区报告生成失败'
      });
    });
  },

  normalizeReportResult(result) {
    const stats = result.stats || null;
    const issueTypeStats = Array.isArray(result.issueTypeStats)
      ? result.issueTypeStats
      : this.rankCounts(stats && stats.categoryCounts).map((item) => ({
        name: item.name,
        count: item.count,
        percent: stats && stats.total ? Math.round((item.count / stats.total) * 100) : 0
      }));
    const heatmapPoints = Array.isArray(result.heatmapPoints) ? result.heatmapPoints : [];
    const riskStats = result.riskStats || (stats && stats.riskCounts) || {};
    return {
      loading: false,
      generatedAt: result.generatedAt || '',
      stats,
      overviewCards: Array.isArray(result.overviewCards) ? result.overviewCards : [],
      issueTypeStats,
      riskRows: this.buildRiskRows(riskStats),
      budgetStats: Array.isArray(result.budgetStats) ? result.budgetStats : [],
      heatmapPoints,
      hasHeatmapPoints: heatmapPoints.length > 0,
      typicalIssues: Array.isArray(result.typicalIssues) ? result.typicalIssues : [],
      schemeRecommendations: Array.isArray(result.schemeRecommendations) ? result.schemeRecommendations : [],
      reportSections: Array.isArray(result.reportSections) ? result.reportSections : [],
      reportText: result.reportText || '',
      htmlReportUrl: result.htmlReportUrl || '',
      htmlReportFileID: result.htmlReportFileID || '',
      htmlReportError: result.htmlReportError || '',
      aiStatus: result.aiStatus || '',
      aiErrorType: result.aiErrorType || '',
      aiErrorMessage: result.aiErrorMessage || this.formatAiErrorMessage(result.aiErrorType),
      aiFallback: !!result.aiFallback
    };
  },

  formatAiErrorMessage(errorType) {
    const messages = {
      missing_key: 'AI服务未配置API Key',
      timeout: 'AI接口请求超时',
      http_error: 'AI接口请求失败',
      invalid_response: 'AI接口返回格式异常',
      empty_response: 'AI返回内容为空',
      network_error: 'AI接口网络请求失败',
      empty_data: '社区暂无障碍数据'
    };
    return messages[errorType] || '';
  },

  buildRiskRows(riskStats = {}) {
    return [
      { key: 'high', label: '高风险', count: Number(riskStats.high) || 0, className: 'high', hint: '优先核查' },
      { key: 'medium', label: '中风险', count: Number(riskStats.medium) || 0, className: 'medium', hint: '排期整改' },
      { key: 'low', label: '低风险', count: Number(riskStats.low) || 0, className: 'low', hint: '持续跟踪' }
    ];
  },

  copyHtmlReportUrl() {
    const url = this.data.htmlReportUrl;
    if (!url) {
      wx.showToast({
        title: '暂无HTML链接',
        icon: 'none'
      });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        });
      }
    });
  },

  drawHeatmap(points = []) {
    wx.createSelectorQuery()
      .in(this)
      .select('#communityHeatmap')
      .boundingClientRect((rect) => {
        const width = Math.max(280, Math.round((rect && rect.width) || 320));
        const height = Math.max(180, Math.round((rect && rect.height) || 220));
        const ctx = wx.createCanvasContext('communityHeatmap', this);
        const validPoints = points.filter((point) => this.isValidCoord(point.latitude, point.longitude));

        this.drawMapBackground(ctx, width, height);
        if (!validPoints.length) {
          ctx.setFillStyle('#64748b');
          ctx.setFontSize(14);
          ctx.setTextAlign('center');
          ctx.fillText('暂无可视化坐标数据', width / 2, height / 2);
          ctx.draw(false, () => {
            this.setData({ heatmapReady: true });
          });
          return;
        }

        const bounds = this.deriveBounds(validPoints);
        validPoints.forEach((point) => {
          const pos = this.projectPoint(point, bounds, width, height);
          this.drawHeatBlob(ctx, pos.x, pos.y, point.riskLevel, Number(point.weight) || 0.5);
        });
        this.drawHeatLegend(ctx, width, height);

        ctx.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: 'communityHeatmap',
            width,
            height,
            destWidth: width * 2,
            destHeight: height * 2,
            success: (res) => {
              this.setData({
                heatmapImagePath: res.tempFilePath || '',
                heatmapReady: true
              });
            },
            fail: () => {
              this.setData({ heatmapReady: true });
            }
          }, this);
        });
      })
      .exec();
  },

  drawMapBackground(ctx, width, height) {
    ctx.setFillStyle('#eef6fb');
    ctx.fillRect(0, 0, width, height);
    ctx.setFillStyle('#f8fafc');
    ctx.fillRect(18, 18, width - 36, height - 36);

    ctx.setStrokeStyle('#d6e3ee');
    ctx.setLineWidth(12);
    ctx.setLineCap('round');
    this.drawLine(ctx, 24, height * 0.25, width - 24, height * 0.25);
    this.drawLine(ctx, 30, height * 0.74, width - 30, height * 0.74);
    this.drawLine(ctx, width * 0.28, 24, width * 0.28, height - 24);
    this.drawLine(ctx, width * 0.62, 24, width * 0.62, height - 24);

    ctx.setLineWidth(8);
    ctx.beginPath();
    ctx.moveTo(36, height * 0.52);
    ctx.quadraticCurveTo(width * 0.34, height * 0.34, width * 0.52, height * 0.58);
    ctx.quadraticCurveTo(width * 0.7, height * 0.78, width - 42, height * 0.48);
    ctx.stroke();
  },

  drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  },

  drawHeatBlob(ctx, x, y, riskLevel, weight) {
    const rgb = this.riskRgb(riskLevel);
    const safeWeight = Math.max(0.2, Math.min(1, weight));
    [
      { radius: 54, alpha: 0.08 },
      { radius: 38, alpha: 0.16 },
      { radius: 24, alpha: 0.28 },
      { radius: 10, alpha: 0.68 }
    ].forEach((layer) => {
      ctx.beginPath();
      ctx.setFillStyle(`rgba(${rgb}, ${layer.alpha * safeWeight})`);
      ctx.arc(x, y, layer.radius * safeWeight, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  drawHeatLegend(ctx, width, height) {
    const x = width - 38;
    const y = height - 106;
    const colors = ['#dc2626', '#f59e0b', '#2563eb'];
    colors.forEach((color, index) => {
      ctx.setFillStyle(color);
      ctx.fillRect(x, y + index * 24, 12, 24);
    });
    ctx.setFillStyle('#334155');
    ctx.setFontSize(11);
    ctx.setTextAlign('left');
    ctx.fillText('高', x + 18, y + 12);
    ctx.fillText('低', x + 18, y + 72);
  },

  riskRgb(riskLevel) {
    if (riskLevel === 'high') return '220, 38, 38';
    if (riskLevel === 'medium') return '245, 158, 11';
    return '37, 99, 235';
  },

  deriveBounds(points) {
    let minLat = points[0].latitude;
    let maxLat = points[0].latitude;
    let minLng = points[0].longitude;
    let maxLng = points[0].longitude;
    points.forEach((point) => {
      minLat = Math.min(minLat, point.latitude);
      maxLat = Math.max(maxLat, point.latitude);
      minLng = Math.min(minLng, point.longitude);
      maxLng = Math.max(maxLng, point.longitude);
    });
    const latPad = Math.max((maxLat - minLat) * 0.18, 0.0005);
    const lngPad = Math.max((maxLng - minLng) * 0.18, 0.0005);
    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad
    };
  },

  projectPoint(point, bounds, width, height) {
    const x = ((point.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * (width - 72) + 36;
    const y = ((bounds.maxLat - point.latitude) / (bounds.maxLat - bounds.minLat || 1)) * (height - 56) + 28;
    return { x, y };
  },

  isValidCoord(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  },

  rankCounts(value) {
    return Object.keys(value || {})
      .map((name) => ({ name, count: Number(value[name]) || 0 }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }
});
