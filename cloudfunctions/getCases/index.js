// cloudfunctions/getCases/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const media = require('./media');

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

    const data = await replaceMediaList(result.data || []);

    return {
      success: true,
      data,
      pagination: {
        page: page,
        pageSize: pageSize,
        total: data.length,
        hasMore: data.length >= pageSize
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

async function replaceMediaList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const cloudIds = new Set();
  list.forEach((item) => media.collectCloudFileIdsDeep(item, cloudIds, { maxScan: 120 }));
  const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getCases'
  });
  return list.map((item) => media.replaceCloudUrlsDeep(item, urlMap, { maxDepth: 6 }));
}
