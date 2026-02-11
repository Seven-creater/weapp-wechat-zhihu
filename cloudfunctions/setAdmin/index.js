// cloudfunctions/setAdmin/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

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

// 管理员权限配置（不改变用户身份，只添加管理员权限）
const ADMIN_PERMISSIONS = {
  canVerifyIssue: true,
  canCreateProject: true,
  canPublishPolicy: true,
  canProvideConsultation: true,
  canDesignSolution: true,
  canUpdateProgress: true,
  canViewUserContact: true,
  canManageUsers: true,           // 管理用户
  canReviewCertification: true,   // 审核认证
  canDeleteContent: true,         // 删除内容
  canManageSystem: true           // 系统管理
};

/**
 * 给用户添加管理员权限（保持原有身份不变）
 * 注意：此云函数应该只允许超级管理员调用
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetOpenid } = event;

  try {
    // 🔒 安全检查：只允许管理员调用此函数
    const callerIsAdmin = await isAdmin(OPENID);
    
    if (!callerIsAdmin) {
      return {
        success: false,
        error: '权限不足：只有管理员可以设置其他管理员'
      };
    }

    // 查询目标用户
    const targetQuery = await db.collection('users')
      .where({ _openid: targetOpenid })
      .limit(1)
      .get();

    if (!targetQuery.data || targetQuery.data.length === 0) {
      return {
        success: false,
        error: '目标用户不存在'
      };
    }

    const targetUser = targetQuery.data[0];

    // 只更新权限，保持原有的 userType 和 badge 不变
    await db.collection('users')
      .doc(targetUser._id)
      .update({
        data: {
          permissions: ADMIN_PERMISSIONS,
          isAdmin: true,  // 添加管理员标识
          updateTime: db.serverDate()
        }
      });

    console.log('✅ 用户已获得管理员权限:', targetOpenid);
    console.log('   保持原有身份:', targetUser.userType, targetUser.userTypeLabel);

    return {
      success: true,
      message: '已成功添加管理员权限',
      data: {
        openid: targetOpenid,
        userType: targetUser.userType,  // 保持原有身份
        badge: targetUser.badge,        // 保持原有徽章
        isAdmin: true,
        permissions: ADMIN_PERMISSIONS
      }
    };

  } catch (err) {
    console.error('设置管理员权限失败:', err);
    return {
      success: false,
      error: err.message || '设置失败'
    };
  }
};

