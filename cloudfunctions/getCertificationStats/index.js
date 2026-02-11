// 云函数：getCertificationStats
// 获取认证申请统计数据（管理员使用）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 🔐 超级管理员列表（硬编码）
const SUPER_ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',
  'oOJhu3T9Us9TAnibhfctmyRw2Urc'
];

/**
 * 检查是否是管理员
 */
async function isAdmin(openid) {
  // 1. 首先检查是否是超级管理员
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    console.log('✅ 超级管理员权限验证通过:', openid);
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
        console.log('✅ 数据库管理员权限验证通过:', openid);
        return true;
      }
    }
  } catch (err) {
    console.error('查询管理员权限失败:', err);
  }

  console.log('❌ 管理员权限验证失败:', openid);
  return false;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // ✅ 验证管理员权限（混合检查：硬编码 + 数据库）
    const hasAdminPermission = await isAdmin(openid);
    if (!hasAdminPermission) {
      return {
        success: false,
        error: '权限不足'
      };
    }

    // 统计待审核
    const pendingResult = await db.collection('users')
      .where({
        'certificationApplication.status': 'pending'
      })
      .count();

    // 统计已通过
    const approvedResult = await db.collection('users')
      .where({
        'certificationApplication.status': 'approved'
      })
      .count();

    // 统计已拒绝
    const rejectedResult = await db.collection('users')
      .where({
        'certificationApplication.status': 'rejected'
      })
      .count();

    // 按角色统计
    const designerResult = await db.collection('users')
      .where({
        userType: 'designer'
      })
      .count();

    const contractorResult = await db.collection('users')
      .where({
        userType: 'contractor'
      })
      .count();

    const communityWorkerResult = await db.collection('users')
      .where({
        userType: 'communityWorker'
      })
      .count();

    return {
      success: true,
      stats: {
        pending: pendingResult.total,
        approved: approvedResult.total,
        rejected: rejectedResult.total,
        byRole: {
          designer: designerResult.total,
          contractor: contractorResult.total,
          communityWorker: communityWorkerResult.total
        }
      }
    };

  } catch (err) {
    console.error('获取统计数据失败:', err);
    return {
      success: false,
      error: err.message || '获取失败'
    };
  }
};



