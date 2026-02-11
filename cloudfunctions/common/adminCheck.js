// 统一的管理员权限检查模块
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 🔐 超级管理员列表（硬编码，拥有最高权限）
const SUPER_ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',  // 你的超级管理员账号
  'oOJhu3T9Us9TAnibhfctmyRw2Urc'   // 另一个管理员账号
];

/**
 * 检查用户是否是管理员
 * @param {string} openid - 用户的 openid
 * @returns {Promise<boolean>} - 是否是管理员
 */
async function isAdmin(openid) {
  // 1. 首先检查是否是超级管理员（硬编码）
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
      
      // 检查是否有管理员标识或管理员权限
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

/**
 * 检查用户是否有特定权限
 * @param {string} openid - 用户的 openid
 * @param {string} permission - 权限名称
 * @returns {Promise<boolean>} - 是否有该权限
 */
async function hasPermission(openid, permission) {
  // 超级管理员拥有所有权限
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    return true;
  }

  try {
    const userQuery = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();

    if (userQuery.data && userQuery.data.length > 0) {
      const user = userQuery.data[0];
      return user.permissions && user.permissions[permission] === true;
    }
  } catch (err) {
    console.error('查询用户权限失败:', err);
  }

  return false;
}

module.exports = {
  isAdmin,
  hasPermission,
  SUPER_ADMIN_OPENIDS
};

