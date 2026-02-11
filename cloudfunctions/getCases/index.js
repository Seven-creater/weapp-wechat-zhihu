// cloudfunctions/getCases/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { category, page = 1, pageSize = 20 } = event;

    // 构建查询条件
    let whereCondition = {};
    if (category) {
      whereCondition.category = category;
    }

    // 查询案例
    const skip = (page - 1) * pageSize;
    const result = await db.collection('cases')
      .where(whereCondition)
      .orderBy('completedAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    return {
      success: true,
      data: result.data,
      pagination: {
        page: page,
        pageSize: pageSize,
        total: result.data.length,
        hasMore: result.data.length >= pageSize
      }
    };

  } catch (err) {
    console.error('获取案例列表失败:', err);
    return {
      success: false,
      error: err.message || '获取失败',
      data: []
    };
  }
};
