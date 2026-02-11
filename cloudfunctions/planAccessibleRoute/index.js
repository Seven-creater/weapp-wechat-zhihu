// cloudfunctions/planAccessibleRoute/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 路线规划云函数
 * 功能：计算无障碍路线，考虑设施状态，避开障碍点
 */
exports.main = async (event, context) => {
  const { 
    startLat, 
    startLng, 
    endLat, 
    endLng,
    avoidBlocked = true,      // 是否避开障碍点
    preferAccessible = true,  // 是否优先可通行设施
    maxDetour = 500           // 最大绕行距离（米）
  } = event;

  try {
    // 1. 验证参数
    if (!startLat || !startLng || !endLat || !endLng) {
      return {
        success: false,
        error: '缺少必要参数：起点和终点坐标'
      };
    }

    // 2. 计算直线距离
    const directDistance = calculateDistance(startLat, startLng, endLat, endLng);

    // 3. 查询路线附近的设施
    const facilities = await queryNearbyFacilities(startLat, startLng, endLat, endLng);

    // 4. 分析设施状态
    const facilityAnalysis = analyzeFacilities(facilities);

    // 5. 计算路线方案
    const routes = await calculateRoutes({
      startLat,
      startLng,
      endLat,
      endLng,
      facilities,
      facilityAnalysis,
      avoidBlocked,
      preferAccessible,
      maxDetour,
      directDistance
    });

    // 6. 返回结果
    return {
      success: true,
      data: {
        routes,                    // 路线方案列表
        directDistance,            // 直线距离
        facilityAnalysis,          // 设施分析
        recommendedRouteIndex: 0   // 推荐路线索引
      }
    };

  } catch (error) {
    console.error('路线规划失败:', error);
    return {
      success: false,
      error: error.message || '路线规划失败'
    };
  }
};

/**
 * 计算两点间距离（米）
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径（米）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

/**
 * 查询路线附近的设施
 */
async function queryNearbyFacilities(startLat, startLng, endLat, endLng) {
  // 计算路线中心点
  const centerLat = (startLat + endLat) / 2;
  const centerLng = (startLng + endLng) / 2;
  
  // 计算查询半径（路线长度的一半 + 500米缓冲）
  const routeLength = calculateDistance(startLat, startLng, endLat, endLng);
  const searchRadius = Math.min(routeLength / 2 + 500, 5000); // 最大5公里

  try {
    // 使用地理位置查询
    const center = new db.Geo.Point(centerLng, centerLat);
    
    const res = await db.collection('facilities')
      .where({
        location: _.geoNear({
          geometry: center,
          maxDistance: searchRadius,
          minDistance: 0
        })
      })
      .limit(100)
      .get();

    return res.data || [];
  } catch (error) {
    console.error('地理位置查询失败，使用普通查询:', error);
    
    // 降级：使用普通查询
    const res = await db.collection('facilities')
      .orderBy('createTime', 'desc')
      .limit(50)
      .get();

    // 手动过滤距离
    const facilities = res.data || [];
    return facilities.filter(facility => {
      const coords = facility.location?.coordinates;
      if (!coords || coords.length < 2) return false;
      
      const lng = coords[0];
      const lat = coords[1];
      const distToCenter = calculateDistance(centerLat, centerLng, lat, lng);
      
      return distToCenter <= searchRadius;
    });
  }
}

/**
 * 分析设施状态
 */
function analyzeFacilities(facilities) {
  const analysis = {
    total: facilities.length,
    accessible: 0,
    blocked: 0,
    maintenance: 0,
    occupied: 0,
    byType: {}
  };

  facilities.forEach(facility => {
    // 统计状态
    switch (facility.status) {
      case 'accessible':
        analysis.accessible++;
        break;
      case 'blocked':
        analysis.blocked++;
        break;
      case 'maintenance':
        analysis.maintenance++;
        break;
      case 'occupied':
        analysis.occupied++;
        break;
    }

    // 统计类型
    const type = facility.facilityType || '其他';
    if (!analysis.byType[type]) {
      analysis.byType[type] = 0;
    }
    analysis.byType[type]++;
  });

  return analysis;
}

/**
 * 计算路线方案
 */
async function calculateRoutes(options) {
  const {
    startLat,
    startLng,
    endLat,
    endLng,
    facilities,
    facilityAnalysis,
    avoidBlocked,
    preferAccessible,
    maxDetour,
    directDistance
  } = options;

  const routes = [];

  // 方案1：推荐路线（考虑无障碍设施）
  const recommendedRoute = await calculateRecommendedRoute({
    startLat,
    startLng,
    endLat,
    endLng,
    facilities,
    avoidBlocked,
    preferAccessible,
    directDistance
  });
  routes.push(recommendedRoute);

  // 方案2：最短路线（不考虑设施）
  const shortestRoute = {
    name: '最短路线',
    type: 'shortest',
    distance: directDistance,
    duration: Math.ceil(directDistance / 1.2), // 假设步行速度1.2m/s
    waypoints: [
      { latitude: startLat, longitude: startLng, name: '起点' },
      { latitude: endLat, longitude: endLng, name: '终点' }
    ],
    facilities: [],
    warnings: [],
    score: 60 // 评分较低
  };
  routes.push(shortestRoute);

  // 方案3：无障碍优先路线（经过更多可通行设施）
  if (facilityAnalysis.accessible > 0) {
    const accessibleRoute = await calculateAccessiblePriorityRoute({
      startLat,
      startLng,
      endLat,
      endLng,
      facilities,
      directDistance
    });
    routes.push(accessibleRoute);
  }

  return routes;
}

/**
 * 计算推荐路线
 */
async function calculateRecommendedRoute(options) {
  const {
    startLat,
    startLng,
    endLat,
    endLng,
    facilities,
    avoidBlocked,
    preferAccessible,
    directDistance
  } = options;

  // 筛选路线上的设施
  const routeFacilities = facilities.filter(facility => {
    const coords = facility.location?.coordinates;
    if (!coords || coords.length < 2) return false;

    const lng = coords[0];
    const lat = coords[1];

    // 计算设施到路线的距离
    const distToRoute = pointToLineDistance(
      lat, lng,
      startLat, startLng,
      endLat, endLng
    );

    // 只考虑距离路线100米内的设施
    return distToRoute <= 100;
  });

  // 过滤障碍点
  const blockedFacilities = routeFacilities.filter(f => f.status === 'blocked');
  const accessibleFacilities = routeFacilities.filter(f => f.status === 'accessible');

  // 生成路径点
  const waypoints = [
    { latitude: startLat, longitude: startLng, name: '起点' }
  ];

  // 添加可通行设施作为途经点
  if (preferAccessible && accessibleFacilities.length > 0) {
    // 选择最多3个可通行设施
    const selectedFacilities = accessibleFacilities
      .sort((a, b) => {
        const coordsA = a.location.coordinates;
        const coordsB = b.location.coordinates;
        const distA = calculateDistance(startLat, startLng, coordsA[1], coordsA[0]);
        const distB = calculateDistance(startLat, startLng, coordsB[1], coordsB[0]);
        return distA - distB;
      })
      .slice(0, 3);

    selectedFacilities.forEach(facility => {
      const coords = facility.location.coordinates;
      waypoints.push({
        latitude: coords[1],
        longitude: coords[0],
        name: facility.name,
        facilityId: facility._id,
        status: facility.status
      });
    });
  }

  waypoints.push({ latitude: endLat, longitude: endLng, name: '终点' });

  // 计算总距离
  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dist = calculateDistance(
      waypoints[i].latitude,
      waypoints[i].longitude,
      waypoints[i + 1].latitude,
      waypoints[i + 1].longitude
    );
    totalDistance += dist;
  }

  // 生成警告信息
  const warnings = [];
  if (blockedFacilities.length > 0) {
    warnings.push({
      type: 'blocked',
      message: `路线附近有 ${blockedFacilities.length} 个障碍点`,
      facilities: blockedFacilities.map(f => ({
        id: f._id,
        name: f.name,
        latitude: f.location.coordinates[1],
        longitude: f.location.coordinates[0]
      }))
    });
  }

  // 计算评分（0-100）
  let score = 100;
  score -= blockedFacilities.length * 10; // 每个障碍点扣10分
  score += accessibleFacilities.length * 5; // 每个可通行设施加5分
  score = Math.max(0, Math.min(100, score));

  return {
    name: '推荐路线',
    type: 'recommended',
    distance: totalDistance,
    duration: Math.ceil(totalDistance / 1.2), // 步行速度1.2m/s
    waypoints,
    facilities: routeFacilities.map(f => ({
      id: f._id,
      name: f.name,
      type: f.facilityType,
      status: f.status,
      latitude: f.location.coordinates[1],
      longitude: f.location.coordinates[0]
    })),
    warnings,
    score
  };
}

/**
 * 计算无障碍优先路线
 */
async function calculateAccessiblePriorityRoute(options) {
  const {
    startLat,
    startLng,
    endLat,
    endLng,
    facilities,
    directDistance
  } = options;

  // 只选择可通行的设施
  const accessibleFacilities = facilities.filter(f => f.status === 'accessible');

  // 生成路径点
  const waypoints = [
    { latitude: startLat, longitude: startLng, name: '起点' }
  ];

  // 选择最多5个可通行设施
  const selectedFacilities = accessibleFacilities
    .sort((a, b) => {
      const coordsA = a.location.coordinates;
      const coordsB = b.location.coordinates;
      const distA = calculateDistance(startLat, startLng, coordsA[1], coordsA[0]);
      const distB = calculateDistance(startLat, startLng, coordsB[1], coordsB[0]);
      return distA - distB;
    })
    .slice(0, 5);

  selectedFacilities.forEach(facility => {
    const coords = facility.location.coordinates;
    waypoints.push({
      latitude: coords[1],
      longitude: coords[0],
      name: facility.name,
      facilityId: facility._id,
      status: facility.status
    });
  });

  waypoints.push({ latitude: endLat, longitude: endLng, name: '终点' });

  // 计算总距离
  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dist = calculateDistance(
      waypoints[i].latitude,
      waypoints[i].longitude,
      waypoints[i + 1].latitude,
      waypoints[i + 1].longitude
    );
    totalDistance += dist;
  }

  return {
    name: '无障碍优先',
    type: 'accessible_priority',
    distance: totalDistance,
    duration: Math.ceil(totalDistance / 1.2),
    waypoints,
    facilities: selectedFacilities.map(f => ({
      id: f._id,
      name: f.name,
      type: f.facilityType,
      status: f.status,
      latitude: f.location.coordinates[1],
      longitude: f.location.coordinates[0]
    })),
    warnings: [],
    score: 95 // 高评分
  };
}

/**
 * 计算点到线段的距离
 */
function pointToLineDistance(px, py, x1, y1, x2, y2) {
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

  const dx = px - xx;
  const dy = py - yy;

  // 返回米为单位的距离
  return calculateDistance(px, py, xx, yy);
}

