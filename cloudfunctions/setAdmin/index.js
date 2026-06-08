// cloudfunctions/setAdmin/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[setAdmin] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[setAdmin] shared validate unavailable');
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

function isSuperAdmin(openid) {
  if (sharedAuth && typeof sharedAuth.isSuperAdmin === 'function') {
    return sharedAuth.isSuperAdmin({ openid });
  }
  return SUPER_ADMIN_OPENIDS.includes(openid);
}

function maskOpenid(openid) {
  if (sharedAuth && typeof sharedAuth.maskOpenid === 'function') {
    return sharedAuth.maskOpenid(openid);
  }
  if (typeof openid !== 'string' || openid.length < 8) return 'unknown';
  return `${openid.slice(0, 3)}***${openid.slice(-3)}`;
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

async function writeAdminAuditLog({ actorOpenid, action, targetOpenid, success, reason }) {
  try {
    await db.collection('admin_audit_logs').add({
      data: {
        actorOpenid,
        action,
        targetOpenid,
        success: success === true,
        reason: typeof reason === 'string' ? reason.slice(0, 120) : '',
        createTime: db.serverDate()
      }
    });
  } catch (err) {
    console.warn('[setAdmin] audit log failed:', err && err.message ? err.message : err);
  }
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
  const targetCheck = validateString(event && event.targetOpenid, {
    name: 'targetOpenid',
    required: true,
    min: 8,
    max: 64
  });
  if (!targetCheck.ok) {
    return {
      success: false,
      error: targetCheck.error
    };
  }
  const targetOpenid = targetCheck.value;

  try {
    // 🔒 安全检查：只有环境变量中的超级管理员可以授予管理员权限
    const callerIsSuperAdmin = isSuperAdmin(OPENID);
    
    if (!callerIsSuperAdmin) {
      await writeAdminAuditLog({
        actorOpenid: OPENID,
        action: 'set_admin_denied',
        targetOpenid,
        success: false,
        reason: 'not super admin'
      });
      return {
        success: false,
        error: '权限不足：只有超级管理员可以设置其他管理员'
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

    await writeAdminAuditLog({
      actorOpenid: OPENID,
      action: 'set_admin',
      targetOpenid,
      success: true,
      reason: 'grant admin permissions'
    });

    console.log('✅ 用户已获得管理员权限:', maskOpenid(targetOpenid));
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

