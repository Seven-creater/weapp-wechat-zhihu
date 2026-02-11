// pages/route/plan/index.js
const app = getApp();

Page({
  data: {
    // 起点终点
    startLocation: null,
    endLocation: null,
    startAddress: '我的位置',
    endAddress: '',
    
    // 路线方案
    routes: [],
    selectedRouteIndex: 0,
    
    // 加载状态
    loading: false,
    planning: false,
    
    // 地图
    latitude: 23.099994,
    longitude: 113.32452,
    scale: 14,
    markers: [],
    polyline: [],
    
    // 设置
    avoidBlocked: true,
    preferAccessible: true,
    
    // 设施分析
    facilityAnalysis: null
  },

  onLoad: function (options) {
    // 从参数获取起点终点
    if (options.startLat && options.startLng) {
      this.setData({
        startLocation: {
          latitude: parseFloat(options.startLat),
          longitude: parseFloat(options.startLng)
        }
      });
    }
    
    if (options.endLat && options.endLng) {
      this.setData({
        endLocation: {
          latitude: parseFloat(options.endLat),
          longitude: parseFloat(options.endLng)
        },
        endAddress: options.endAddress || '目的地'
      });
    }
    
    // 获取当前位置作为起点
    if (!this.data.startLocation) {
      this.getCurrentLocation();
    } else {
      // 如果有起点和终点，自动规划路线
      if (this.data.endLocation) {
        this.planRoute();
      }
    }
  },

  // 获取当前位置
  getCurrentLocation: function () {
    wx.showLoading({ title: '定位中...' });
    
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        wx.hideLoading();
        
        this.setData({
          startLocation: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          latitude: res.latitude,
          longitude: res.longitude
        });
        
        // 如果有终点，自动规划
        if (this.data.endLocation) {
          this.planRoute();
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('定位失败:', err);
        wx.showToast({
          title: '定位失败',
          icon: 'none'
        });
      }
    });
  },

  // 选择起点
  chooseStartLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          startLocation: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          startAddress: res.name || res.address
        });
        
        // 如果有终点，重新规划
        if (this.data.endLocation) {
          this.planRoute();
        }
      }
    });
  },

  // 选择终点
  chooseEndLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          endLocation: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          endAddress: res.name || res.address
        });
        
        // 如果有起点，自动规划
        if (this.data.startLocation) {
          this.planRoute();
        }
      }
    });
  },

  // 交换起点终点
  swapLocations: function () {
    const { startLocation, endLocation, startAddress, endAddress } = this.data;
    
    if (!startLocation || !endLocation) {
      wx.showToast({
        title: '请先选择起点和终点',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      startLocation: endLocation,
      endLocation: startLocation,
      startAddress: endAddress,
      endAddress: startAddress
    }, () => {
      this.planRoute();
    });
  },

  // 规划路线
  planRoute: function () {
    const { startLocation, endLocation } = this.data;
    
    if (!startLocation || !endLocation) {
      wx.showToast({
        title: '请选择起点和终点',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ planning: true });
    wx.showLoading({ title: '规划中...' });
    
    wx.cloud.callFunction({
      name: 'planAccessibleRoute',
      data: {
        startLat: startLocation.latitude,
        startLng: startLocation.longitude,
        endLat: endLocation.latitude,
        endLng: endLocation.longitude,
        avoidBlocked: this.data.avoidBlocked,
        preferAccessible: this.data.preferAccessible
      }
    }).then(res => {
      wx.hideLoading();
      this.setData({ planning: false });
      
      if (res.result && res.result.success) {
        const data = res.result.data;
        
        this.setData({
          routes: data.routes || [],
          selectedRouteIndex: data.recommendedRouteIndex || 0,
          facilityAnalysis: data.facilityAnalysis
        }, () => {
          this.updateMapDisplay();
        });
        
        wx.showToast({
          title: '规划成功',
          icon: 'success'
        });
      } else {
        throw new Error(res.result?.error || '规划失败');
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ planning: false });
      
      console.error('路线规划失败:', err);
      wx.showToast({
        title: err.message || '规划失败',
        icon: 'none'
      });
    });
  },

  // 选择路线方案
  selectRoute: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ selectedRouteIndex: index }, () => {
      this.updateMapDisplay();
    });
  },

  // 更新地图显示
  updateMapDisplay: function () {
    const { routes, selectedRouteIndex } = this.data;
    
    if (!routes || routes.length === 0) return;
    
    const route = routes[selectedRouteIndex];
    if (!route) return;
    
    // 生成标记
    const markers = route.waypoints.map((point, index) => {
      let iconPath = '/images/marker_alert.svg';
      let width = 32;
      let height = 32;
      
      if (index === 0) {
        // 起点
        iconPath = '/images/icon_start.png';
        width = 36;
        height = 36;
      } else if (index === route.waypoints.length - 1) {
        // 终点
        iconPath = '/images/icon_end.png';
        width = 36;
        height = 36;
      } else if (point.status === 'accessible') {
        // 可通行设施
        iconPath = '/images/marker_accessible.png';
      }
      
      return {
        id: index,
        latitude: point.latitude,
        longitude: point.longitude,
        width,
        height,
        iconPath,
        callout: {
          content: point.name,
          color: '#111827',
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: '#ffffff',
          display: 'ALWAYS'
        }
      };
    });
    
    // 生成路线
    const polyline = [{
      points: route.waypoints.map(p => ({
        latitude: p.latitude,
        longitude: p.longitude
      })),
      color: '#667eea',
      width: 6,
      borderColor: '#ffffff',
      borderWidth: 2,
      arrowLine: true
    }];
    
    // 计算地图中心和缩放级别
    const lats = route.waypoints.map(p => p.latitude);
    const lngs = route.waypoints.map(p => p.longitude);
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
    
    this.setData({
      markers,
      polyline,
      latitude: centerLat,
      longitude: centerLng,
      scale: 14
    });
  },

  // 开始导航
  startNavigation: function () {
    const { routes, selectedRouteIndex } = this.data;
    
    if (!routes || routes.length === 0) {
      wx.showToast({
        title: '请先规划路线',
        icon: 'none'
      });
      return;
    }
    
    const route = routes[selectedRouteIndex];
    
    // 跳转到导航页面
    wx.navigateTo({
      url: `/pages/route/navigate/index?routeData=${encodeURIComponent(JSON.stringify(route))}`
    });
  },

  // 使用微信地图导航
  useWechatMap: function () {
    const { endLocation, endAddress } = this.data;
    
    if (!endLocation) {
      wx.showToast({
        title: '请选择目的地',
        icon: 'none'
      });
      return;
    }
    
    wx.openLocation({
      latitude: endLocation.latitude,
      longitude: endLocation.longitude,
      name: endAddress,
      scale: 18
    });
  },

  // 切换设置
  toggleAvoidBlocked: function () {
    this.setData({
      avoidBlocked: !this.data.avoidBlocked
    }, () => {
      if (this.data.routes.length > 0) {
        this.planRoute();
      }
    });
  },

  togglePreferAccessible: function () {
    this.setData({
      preferAccessible: !this.data.preferAccessible
    }, () => {
      if (this.data.routes.length > 0) {
        this.planRoute();
      }
    });
  },

  // 格式化距离
  formatDistance: function (meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}米`;
    }
    return `${(meters / 1000).toFixed(1)}公里`;
  },

  // 格式化时间
  formatDuration: function (seconds) {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分钟`;
  },

  // 获取路线评分颜色
  getScoreColor: function (score) {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  }
});

