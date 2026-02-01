// 云函数：getCommunityWorkerCertApplications
// 获取社区工作者认证申请列表（从 users 集合读取）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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

    // 查询有认证申请的用户
    const skip = (page - 1) * pageSize;
    
    const result = await db.collection('users')
      .where({
        'certificationApplication.status': status,
        'certificationApplication.type': 'communityWorker'
      })
      .orderBy('certificationApplication.applyTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 检查是否还有更多数据
    const total = await db.collection('users')
      .where({
        'certificationApplication.status': status,
        'certificationApplication.type': 'communityWorker'
      })
      .count();

    const hasMore = skip + result.data.length < total.total;

    // 转换数据格式，提取认证申请信息
    const applications = result.data.map(user => ({
      _id: user._id,
      openid: user._openid,
      nickName: user.userInfo?.nickName || '未知用户',
      avatarUrl: user.userInfo?.avatarUrl || '/images/zhi.png',
      phoneNumber: user.phoneNumber || '',
      community: user.certificationApplication.community,
      position: user.certificationApplication.position,
      workId: user.certificationApplication.workId,
      status: user.certificationApplication.status,
      applyTime: user.certificationApplication.applyTime,
      reviewTime: user.certificationApplication.reviewTime,
      reviewerId: user.certificationApplication.reviewerId,
      rejectReason: user.certificationApplication.rejectReason
    }));

    return {
      success: true,
      applications: applications,
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

