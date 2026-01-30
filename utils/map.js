// 無界营造 - 地图服务模块
// utils/map.js

const QQMapWX = require('./qqmap-wx-jssdk.js');
const config = require('../config/index.js');

let qqmapsdk = null;

/**
 * 初始化地图 SDK
 */
function initMapSDK() {
  if (!qqmapsdk) {
    qqmapsdk = new QQMapWX({
      key: config.TENCENT_MAP_KEY
    });
  }
  return qqmapsdk;
}

/**
 * 搜索地点
 * @param {Object} options - 搜索参数
 * @returns {Promise}
 */
function searchPlace(options) {
  const sdk = initMapSDK();
  
  return new Promise((resolve, reject) => {
    sdk.search({
      keyword: options.keyword || '',
      location: options.location || null,
      page_size: options.pageSize || 20,
      page_index: options.pageIndex || 1,
      success: (res) => {
        resolve(res.data || []);
      },
      fail: (err) => {
        console.error('搜索地点失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 获取地址建议
 * @param {string} keyword - 关键词
 * @param {Object} location - 位置
 * @returns {Promise}
 */
function getSuggestion(keyword, location) {
  const sdk = initMapSDK();
  
  return new Promise((resolve, reject) => {
    sdk.getSuggestion({
      keyword: keyword,
      location: location || null,
      page_size: 10,
      success: (res) => {
        resolve(res.data || []);
      },
      fail: (err) => {
        console.error('获取建议失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 逆地址解析（坐标转地址）
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @returns {Promise}
 */
function reverseGeocoder(latitude, longitude) {
  const sdk = initMapSDK();
  
  return new Promise((resolve, reject) => {
    sdk.reverseGeocoder({
      location: {
        latitude: latitude,
        longitude: longitude
      },
      success: (res) => {
        resolve(res.result);
      },
      fail: (err) => {
        console.error('逆地址解析失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 地址解析（地址转坐标）
 * @param {string} address - 地址
 * @returns {Promise}
 */
function geocoder(address) {
  const sdk = initMapSDK();
  
  return new Promise((resolve, reject) => {
    sdk.geocoder({
      address: address,
      success: (res) => {
        resolve(res.result);
      },
      fail: (err) => {
        console.error('地址解析失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 路线规划
 * @param {Object} from - 起点 {latitude, longitude}
 * @param {Object} to - 终点 {latitude, longitude}
 * @param {string} mode - 出行方式（driving/walking/bicycling/transit）
 * @returns {Promise}
 */
function getRoute(from, to, mode = 'walking') {
  const sdk = initMapSDK();
  
  return new Promise((resolve, reject) => {
    const params = {
      from: `${from.latitude},${from.longitude}`,
      to: `${to.latitude},${to.longitude}`,
      success: (res) => {
        resolve(res.result);
      },
      fail: (err) => {
        console.error('路线规划失败:', err);
        reject(err);
      }
    };
    
    // 根据出行方式调用不同的接口
    switch (mode) {
      case 'driving':
        sdk.direction(params);
        break;
      case 'walking':
        sdk.walking(params);
        break;
      case 'bicycling':
        sdk.bicycling(params);
        break;
      case 'transit':
        sdk.transit(params);
        break;
      default:
        sdk.walking(params);
    }
  });
}

/**
 * 计算两点距离
 * @param {Object} from - 起点 {latitude, longitude}
 * @param {Object} to - 终点 {latitude, longitude}
 * @returns {number} 距离（米）
 */
function calculateDistance(from, to) {
  const R = 6371000; // 地球半径（米）
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRad(to.longitude - from.longitude);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * 格式化距离
 * @param {number} meters - 距离（米）
 * @returns {string}
 */
function formatDistance(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}

/**
 * 打开地图导航
 * @param {Object} location - 目的地 {latitude, longitude, name, address}
 */
function openMapNavigation(location) {
  wx.openLocation({
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name || '目的地',
    address: location.address || '',
    scale: 18,
  });
}

module.exports = {
  initMapSDK,
  searchPlace,
  getSuggestion,
  reverseGeocoder,
  geocoder,
  getRoute,
  calculateDistance,
  formatDistance,
  openMapNavigation,
};









