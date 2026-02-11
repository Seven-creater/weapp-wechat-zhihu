// 云函数：getFacilities
// 获取无障碍设施列表
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000, // 默认5公里
      facilityType,
      status,
      page = 1,
      pageSize = 50
    } = event;

    let query = {};

    // 1. 地理位置查询
    if (latitude && longitude) {
      const center = new db.Geo.Point(longitude, latitude);
      query.location = _.geoNear({
        geometry: center,
        maxDistance: radius,
        minDistance: 0
      });
    }

    // 2. 设施类型筛选
    if (facilityType) {
      query.facilityType = facilityType;
    }

    // 3. 状态筛选
    if (status) {
      if (Array.isArray(status)) {
        query.status = _.in(status);
      } else {
        query.status = status;
      }
    }

    // 4. 查询设施
    const skip = (page - 1) * pageSize;
    
    let queryBuilder = db.collection('facilities').where(query);
    
    // 如果有地理位置查询，按距离排序
    // 否则按创建时间倒序
    if (!latitude || !longitude) {
      queryBuilder = queryBuilder.orderBy('createTime', 'desc');
    }
    
    const result = await queryBuilder
      .skip(skip)
      .limit(pageSize)
      .get();

    // 5. 统计总数
    const countResult = await db.collection('facilities').where(query).count();

    console.log('✅ 查询设施成功，数量:', result.data.length);

    return {
      success: true,
      data: result.data,
      total: countResult.total,
      page: page,
      pageSize: pageSize,
      hasMore: skip + result.data.length < countResult.total
    };

  } catch (err) {
    console.error('获取设施列表失败:', err);
    
    // 如果地理位置查询失败，尝试不使用地理位置查询
    if (err.message && err.message.includes('geo')) {
      try {
        const {
          facilityType,
          status,
          page = 1,
          pageSize = 50
        } = event;

        let query = {};

        if (facilityType) {
          query.facilityType = facilityType;
        }

        if (status) {
          if (Array.isArray(status)) {
            query.status = _.in(status);
          } else {
            query.status = status;
          }
        }

        const skip = (page - 1) * pageSize;
        const result = await db.collection('facilities')
          .where(query)
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get();

        const countResult = await db.collection('facilities').where(query).count();

        console.log('✅ 查询设施成功（无地理位置），数量:', result.data.length);

        return {
          success: true,
          data: result.data,
          total: countResult.total,
          page: page,
          pageSize: pageSize,
          hasMore: skip + result.data.length < countResult.total
        };
      } catch (fallbackErr) {
        console.error('备用查询也失败:', fallbackErr);
        return {
          success: false,
          error: fallbackErr.message || '获取失败，请稍后重试'
        };
      }
    }

    return {
      success: false,
      error: err.message || '获取失败，请稍后重试'
    };
  }
};

