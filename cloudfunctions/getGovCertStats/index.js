// 云函数：getGovCertStats
// 获取政府认证申请统计数据
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
    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以查看统计数据',
        stats: {
          pending: 0,
          approved: 0,
          rejected: 0
        }
      };
    }

    // 统计各状态的申请数量
    const pendingCount = await db.collection('gov_certifications')
      .where({ status: 'pending' })
      .count();

    const approvedCount = await db.collection('gov_certifications')
      .where({ status: 'approved' })
      .count();

    const rejectedCount = await db.collection('gov_certifications')
      .where({ status: 'rejected' })
      .count();

    return {
      success: true,
      stats: {
        pending: pendingCount.total,
        approved: approvedCount.total,
        rejected: rejectedCount.total
      }
    };

  } catch (err) {
    console.error('获取统计数据失败:', err);
    return {
      success: false,
      error: err.message || '获取失败',
      stats: {
        pending: 0,
        approved: 0,
        rejected: 0
      }
    };
  }
};

