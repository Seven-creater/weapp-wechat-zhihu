// pages/route/navigate/index.js
const app = getApp();

Page({
  data: {
    // 路线数据
    route: null,
    currentWaypointIndex: 0,
    
    // 当前位置
    currentLocation: null,
    latitude: 23.099994,
    longitude: 113.32452,
    scale: 17,
    
    // 地图显示
    markers: [],
    polyline: [],
    
    // 导航状态
    navigating: false,
    arrived: false,
    offRoute: false,
    
    // 距离和方向
    distanceToNext: 0,
    distanceToEnd: 0,
    direction: '',
    
    // 语音提示
    voiceEnabled: true,
    lastVoiceTime: 0,
    
    // 定位监听
    locationWatcher: null
  },

  onLoad: function (options) {
    if (options.routeData) {
      try {
        const route = JSON.parse(decodeURIComponent(options.routeData));
        this.setData({ route }, () => {
          this.initNavigation();
        });
      } catch (error) {
        console.error('解析路线数据失败:', error);
        wx.showToast({
          title: '路线数据错误',
          icon: 'none'
        });
      }
    }
  },

  onUnload: function () {
    this.stopNavigation();
  },

  // 初始化导航
  initNavigation: function () {
    // 获取当前位置
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          currentLocation: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          latitude: res.latitude,
          longitude: res.longitude
        }, () => {
          this.updateMapDisplay();
          this.calculateDistances();
        });
      },
      fail: (err) => {
        console.error('定位失败:', err);
        wx.showToast({
          title: '定位失败',
          icon: 'none'
        });
      }
    });
  },

  // 开始导航
  startNavigation: function () {
    if (this.data.navigating) return;
    
    this.setData({ navigating: true });
    
    // 开始持续定位
    this.startLocationWatch();
    
    // 语音提示
    this.speakText('开始导航');
    
    wx.showToast({
      title: '导航已开始',
      icon: 'success'
    });
  },

  // 停止导航
  stopNavigation: function () {
    if (!this.data.navigating) return;
    
    this.setData({ navigating: false });
    
    // 停止定位监听
    this.stopLocationWatch();
    
    wx.showModal({
      title: '结束导航',
      content: '确定要结束导航吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        } else {
          this.setData({ navigating: true });
          this.startLocationWatch();
        }
      }
    });
  },

  // 开始位置监听
  startLocationWatch: function () {
    // 使用实时位置更新
    this.locationWatcher = setInterval(() => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.updateLocation(res.latitude, res.longitude);
        }
      });
    }, 2000); // 每2秒更新一次
  },

  // 停止位置监听
  stopLocationWatch: function () {
    if (this.locationWatcher) {
      clearInterval(this.locationWatcher);
      this.locationWatcher = null;
    }
  },

  // 更新位置
  updateLocation: function (latitude, longitude) {
    this.setData({
      currentLocation: { latitude, longitude },
      latitude,
      longitude
    }, () => {
      this.calculateDistances();
      this.checkWaypointArrival();
      this.checkOffRoute();
      this.updateMapDisplay();
      this.provideVoiceGuidance();
    });
  },

  // 计算距离
  calculateDistances: function () {
    const { currentLocation, route, currentWaypointIndex } = this.data;
    
    if (!currentLocation || !route || !route.waypoints) return;
    
    // 计算到下一个路径点的距离
    const nextWaypoint = route.waypoints[currentWaypointIndex + 1];
    if (nextWaypoint) {
      const distanceToNext = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        nextWaypoint.latitude,
        nextWaypoint.longitude
      );
      
      this.setData({ distanceToNext });
    }
    
    // 计算到终点的距离
    const endWaypoint = route.waypoints[route.waypoints.length - 1];
    const distanceToEnd = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      endWaypoint.latitude,
      endWaypoint.longitude
    );
    
    this.setData({ distanceToEnd });
    
    // 计算方向
    if (nextWaypoint) {
      const direction = this.calculateDirection(
        currentLocation.latitude,
        currentLocation.longitude,
        nextWaypoint.latitude,
        nextWaypoint.longitude
      );
      
      this.setData({ direction });
    }
  },

  // 检查是否到达路径点
  checkWaypointArrival: function () {
    const { currentLocation, route, currentWaypointIndex } = this.data;
    
    if (!currentLocation || !route) return;
    
    const nextWaypoint = route.waypoints[currentWaypointIndex + 1];
    if (!nextWaypoint) return;
    
    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      nextWaypoint.latitude,
      nextWaypoint.longitude
    );
    
    // 如果距离小于20米，认为已到达
    if (distance < 20) {
      const newIndex = currentWaypointIndex + 1;
      
      // 检查是否到达终点
      if (newIndex === route.waypoints.length - 1) {
        this.arriveAtDestination();
      } else {
        this.arriveAtWaypoint(newIndex);
      }
    }
  },

  // 到达路径点
  arriveAtWaypoint: function (index) {
    const waypoint = this.data.route.waypoints[index];
    
    this.setData({ currentWaypointIndex: index });
    
    // 语音提示
    this.speakText(`已到达${waypoint.name}`);
    
    wx.showToast({
      title: `已到达${waypoint.name}`,
      icon: 'success'
    });
  },

  // 到达终点
  arriveAtDestination: function () {
    this.setData({
      arrived: true,
      navigating: false
    });
    
    this.stopLocationWatch();
    
    // 语音提示
    this.speakText('已到达目的地');
    
    wx.showModal({
      title: '导航完成',
      content: '您已到达目的地！',
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
    });
  },

  // 检查是否偏离路线
  checkOffRoute: function () {
    const { currentLocation, route, currentWaypointIndex } = this.data;
    
    if (!currentLocation || !route) return;
    
    const currentWaypoint = route.waypoints[currentWaypointIndex];
    const nextWaypoint = route.waypoints[currentWaypointIndex + 1];
    
    if (!currentWaypoint || !nextWaypoint) return;
    
    // 计算当前位置到路线的距离
    const distanceToRoute = this.pointToLineDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      currentWaypoint.latitude,
      currentWaypoint.longitude,
      nextWaypoint.latitude,
      nextWaypoint.longitude
    );
    
    // 如果距离大于50米，认为偏离路线
    if (distanceToRoute > 50) {
      if (!this.data.offRoute) {
        this.setData({ offRoute: true });
        this.speakText('您已偏离路线，请返回');
        
        wx.showToast({
          title: '已偏离路线',
          icon: 'none'
        });
      }
    } else {
      if (this.data.offRoute) {
        this.setData({ offRoute: false });
        this.speakText('已返回路线');
      }
    }
  },

  // 语音导航
  provideVoiceGuidance: function () {
    if (!this.data.voiceEnabled || !this.data.navigating) return;
    
    const { distanceToNext, route, currentWaypointIndex } = this.data;
    const now = Date.now();
    
    // 避免频繁播报（至少间隔10秒）
    if (now - this.data.lastVoiceTime < 10000) return;
    
    const nextWaypoint = route.waypoints[currentWaypointIndex + 1];
    if (!nextWaypoint) return;
    
    let message = '';
    
    if (distanceToNext < 50) {
      message = `前方50米到达${nextWaypoint.name}`;
    } else if (distanceToNext < 100) {
      message = `前方100米到达${nextWaypoint.name}`;
    } else if (distanceToNext < 200) {
      message = `前方200米到达${nextWaypoint.name}`;
    }
    
    if (message) {
      this.speakText(message);
      this.setData({ lastVoiceTime: now });
    }
  },

  // 语音播报
  speakText: function (text) {
    if (!this.data.voiceEnabled) return;
    
    // 使用微信插件进行语音合成
    const plugin = requirePlugin('WeChatSI');
    
    plugin.textToSpeech({
      lang: 'zh_CN',
      tts: true,
      content: text,
      success: (res) => {
        const tempFilePath = res.filename;
        const innerAudioContext = wx.createInnerAudioContext();
        innerAudioContext.src = tempFilePath;
        innerAudioContext.play();
      },
      fail: (err) => {
        console.error('语音合成失败:', err);
      }
    });
  },

  // 切换语音
  toggleVoice: function () {
    this.setData({
      voiceEnabled: !this.data.voiceEnabled
    });
    
    wx.showToast({
      title: this.data.voiceEnabled ? '语音已开启' : '语音已关闭',
      icon: 'success'
    });
  },

  // 更新地图显示
  updateMapDisplay: function () {
    const { route, currentLocation, currentWaypointIndex } = this.data;
    
    if (!route) return;
    
    // 生成标记
    const markers = [];
    
    // 当前位置标记
    if (currentLocation) {
      markers.push({
        id: 0,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        width: 40,
        height: 40,
        iconPath: '/images/icon_location.png',
        callout: {
          content: '当前位置',
          color: '#fff',
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: '#667eea',
          display: 'ALWAYS'
        }
      });
    }
    
    // 路径点标记
    route.waypoints.forEach((point, index) => {
      let iconPath = '/images/marker_alert.svg';
      let width = 32;
      let height = 32;
      
      if (index === 0) {
        iconPath = '/images/icon_start.png';
        width = 36;
        height = 36;
      } else if (index === route.waypoints.length - 1) {
        iconPath = '/images/icon_end.png';
        width = 36;
        height = 36;
      } else if (index <= currentWaypointIndex) {
        // 已经过的路径点
        iconPath = '/images/marker_passed.png';
      }
      
      markers.push({
        id: index + 1,
        latitude: point.latitude,
        longitude: point.longitude,
        width,
        height,
        iconPath
      });
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
    
    this.setData({ markers, polyline });
  },

  // 计算两点间距离
  calculateDistance: function (lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad: function (deg) {
    return deg * Math.PI / 180;
  },

  // 计算方向
  calculateDirection: function (lat1, lng1, lat2, lng2) {
    const dLng = lng2 - lng1;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const bearing = Math.atan2(y, x);
    const degrees = (bearing * 180 / Math.PI + 360) % 360;
    
    // 转换为方向文字
    if (degrees >= 337.5 || degrees < 22.5) return '北';
    if (degrees >= 22.5 && degrees < 67.5) return '东北';
    if (degrees >= 67.5 && degrees < 112.5) return '东';
    if (degrees >= 112.5 && degrees < 157.5) return '东南';
    if (degrees >= 157.5 && degrees < 202.5) return '南';
    if (degrees >= 202.5 && degrees < 247.5) return '西南';
    if (degrees >= 247.5 && degrees < 292.5) return '西';
    return '西北';
  },

  // 计算点到线段的距离
  pointToLineDistance: function (px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return this.calculateDistance(px, py, xx, yy);
  },

  // 格式化距离
  formatDistance: function (meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}米`;
    }
    return `${(meters / 1000).toFixed(1)}公里`;
  }
});

