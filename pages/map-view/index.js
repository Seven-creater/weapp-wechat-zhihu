const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    longitude: 0,
    latitude: 0,
    scale: 14,
    markers: [],
    loading: false,
  },

  onLoad: function () {
    this.getUserLocation();
    this.loadIssues();
  },

  onReady: function () {
    this.mapCtx = wx.createMapContext('map', this);
  },

  getUserLocation: function () {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const { latitude, longitude } = res;
        this.setData({
          latitude,
          longitude,
          scale: 14,
        });
      },
      fail: (err) => {
        console.error('获取位置失败:', err);
        wx.showModal({
          title: '定位失败',
          content: '需要获取您的位置信息来显示路障地图',
          showCancel: false,
          success: () => {
            wx.openSetting();
          },
        });
      },
    });
  },

  loadIssues: function () {
    this.setData({ loading: true });
    
    db.collection('issues')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then((res) => {
        const issues = res.data || [];
        const markers = this.convertToMarkers(issues);
        this.setData({ markers, loading: false });
      })
      .catch((err) => {
        console.error('加载路障数据失败:', err);
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'none',
        });
      });
  },

  convertToMarkers: function (issues) {
    return issues
      .filter((issue) => issue.location && issue.location.coordinates)
      .map((issue) => {
        const [longitude, latitude] = issue.location.coordinates;
        const address = issue.address || issue.formattedAddress || '未知地点';
        const description = issue.description || issue.aiSolution || '无描述';
        
        return {
          id: issue._id,
          latitude,
          longitude,
          iconPath: '/images/marker_alert.png',
          width: 40,
          height: 40,
          alpha: 0.9,
          callout: {
            content: address,
            color: '#333333',
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#ffffff',
            padding: 8,
            display: 'ALWAYS',
            textAlign: 'center',
          },
        };
      });
  },

  onMarkerTap: function (e) {
    const markerId = e.detail.markerId;
    if (!markerId) return;
    
    wx.navigateTo({
      url: `/pages/solution-detail/index?id=${markerId}`,
    });
  },

  onRegionChange: function (e) {
    if (e.type === 'end') {
      const { latitude, longitude } = e.detail.region;
      this.setData({
        latitude,
        longitude,
      });
    }
  },

  centerToUser: function () {
    this.getUserLocation();
  },

  refreshMarkers: function () {
    this.loadIssues();
  },
});
