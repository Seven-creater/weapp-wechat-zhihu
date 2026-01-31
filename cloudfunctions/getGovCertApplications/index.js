// 云函数：getGovCertApplications
// 获取政府认证申请列表
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 你的管理员账号（正确的 openid）
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  try {
    const { status = 'pending', page = 1, pageSize = 20 } = event;

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以查看认证申请',
        applications: [],
        hasMore: false
      };
    }

    // 查询申请列表
    const skip = (page - 1) * pageSize;
    
    const result = await db.collection('gov_certifications')
      .where({
        status: status
      })
      .orderBy('applyTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 检查是否还有更多数据
    const total = await db.collection('gov_certifications')
      .where({ status: status })
      .count();

    const hasMore = skip + result.data.length < total.total;

    return {
      success: true,
      applications: result.data,
      hasMore: hasMore,
      total: total.total
    };

  } catch (err) {
    console.error('获取申请列表失败:', err);
    return {
      success: false,
      error: err.message || '获取失败',
      applications: [],
      hasMore: false
    };
  }
};

