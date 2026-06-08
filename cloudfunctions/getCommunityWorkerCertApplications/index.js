// 云函数：getCommunityWorkerCertApplications
// 获取社区工作者认证申请列表（从 users 集合读取）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[getCommunityWorkerCertApplications] shared auth unavailable');
}

// 🔐 超级管理员列表（硬编码）
const SUPER_ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

/**
 * 检查是否是管理员
 */
async function isAdmin(openid) {
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  // 1. 首先检查是否是超级管理员
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    console.log('[security] event logged');
    return true;
  }

  // 2. 检查数据库中的管理员标识
  try {
    const userQuery = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();

    if (userQuery.data && userQuery.data.length > 0) {
      const user = userQuery.data[0];
      
      if (user.isAdmin === true || 
          (user.permissions && user.permissions.canManageUsers === true)) {
        console.log('[security] event logged');
        return true;
      }
    }
  } catch (err) {
    console.error('查询管理员权限失败:', err);
  }

  console.log('[security] event logged');
  return false;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  try {
    const { status = 'pending', page = 1, pageSize = 20 } = event;

    // ✅ 验证管理员权限（混合检查：硬编码 + 数据库）
    const hasAdminPermission = await isAdmin(wxContext.OPENID);
    if (!hasAdminPermission) {
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

