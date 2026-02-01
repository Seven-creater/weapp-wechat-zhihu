// 云函数：getCommunityWorkerCertStats
// 获取社区工作者认证统计数据（从 users 集合读取）
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
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      db.collection('users').where({ 
        'certificationApplication.status': 'pending',
        'certificationApplication.type': 'communityWorker'
      }).count(),
      db.collection('users').where({ 
        'certificationApplication.status': 'approved',
        'certificationApplication.type': 'communityWorker'
      }).count(),
      db.collection('users').where({ 
        'certificationApplication.status': 'rejected',
        'certificationApplication.type': 'communityWorker'
      }).count()
    ]);

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

