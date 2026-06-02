// 云函数：reviewCommunityWorkerCertification
// 审核社区工作者认证申请（从 users 集合读取和更新）
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
  console.warn('[reviewCommunityWorkerCertification] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[reviewCommunityWorkerCertification] shared validate unavailable');
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

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

function validateEnum(value, allowed, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateEnum === 'function') {
    return sharedValidate.validateEnum(value, allowed, options);
  }
  if (!Array.isArray(allowed) || !allowed.includes(value)) {
    return { ok: false, error: `invalid ${options.name || 'value'}` };
  }
  return { ok: true, value };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const reviewerOpenid = wxContext.OPENID;

  try {
    const applicationIdCheck = validateString(event && event.applicationId, {
      name: 'applicationId',
      required: true,
      min: 8,
      max: 64
    });
    if (!applicationIdCheck.ok) {
      return {
        success: false,
        error: applicationIdCheck.error
      };
    }
    const statusCheck = validateEnum(event && event.status, ['approved', 'rejected'], {
      name: 'status',
      required: true
    });
    if (!statusCheck.ok) {
      return {
        success: false,
        error: statusCheck.error
      };
    }
    const applicationId = applicationIdCheck.value;
    const status = statusCheck.value;
    let rejectReason = '';

    if (status === 'rejected') {
      const rejectReasonCheck = validateString(event && event.rejectReason, {
        name: 'rejectReason',
        required: true,
        min: 1,
        max: 200
      });
      if (!rejectReasonCheck.ok) {
        return {
          success: false,
          error: rejectReasonCheck.error === 'missing rejectReason'
            ? '拒绝时必须填写原因'
            : rejectReasonCheck.error
        };
      }
      rejectReason = rejectReasonCheck.value;
    }

    if (status === 'rejected' && !rejectReason) {
      return {
        success: false,
        error: '拒绝时必须填写原因'
      };
    }

    // ✅ 验证管理员权限（混合检查：硬编码 + 数据库）
    const hasAdminPermission = await isAdmin(reviewerOpenid);
    if (!hasAdminPermission) {
      return {
        success: false,
        error: '权限不足，仅管理员可以审核认证申请'
      };
    }

    // 获取用户信息
    const user = await db.collection('users')
      .doc(applicationId)
      .get();

    if (!user.data) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    if (!user.data.certificationApplication || user.data.certificationApplication.status !== 'pending') {
      return {
        success: false,
        error: '该申请已被审核或不存在'
      };
    }

    const userOpenid = user.data._openid;
    
    console.log('🔍 准备审核认证申请，用户 openid:', userOpenid);

    // 如果审核通过，更新用户身份
    if (status === 'approved') {
      // 🔧 社区工作者徽章配置
      const communityWorkerBadge = {
        color: '#EF4444',
        icon: '🔴',
        text: '社区工作者'
      };

      // 更新用户信息：升级为社区工作者
      await db.collection('users')
        .doc(applicationId)
        .update({
          data: {
            userType: 'communityWorker',
            badge: communityWorkerBadge,
            userTypeLabel: '社区工作者',
            'profile.community': user.data.certificationApplication.community,
            'profile.position': user.data.certificationApplication.position,
            'profile.workId': user.data.certificationApplication.workId,
            'certificationApplication.status': 'approved',
            'certificationApplication.reviewTime': Date.now(),
            'certificationApplication.reviewerId': reviewerOpenid,
            certificationTime: Date.now(),
            updateTime: db.serverDate()
          }
        });

      console.log('✅ 用户身份已更新为社区工作者:', userOpenid);
    } else {
      // 审核拒绝，只更新申请状态
      await db.collection('users')
        .doc(applicationId)
        .update({
          data: {
            'certificationApplication.status': 'rejected',
            'certificationApplication.reviewTime': Date.now(),
            'certificationApplication.reviewerId': reviewerOpenid,
            'certificationApplication.rejectReason': rejectReason,
            updateTime: db.serverDate()
          }
        });

      console.log('❌ 认证申请已拒绝:', userOpenid);
    }

    return {
      success: true,
      message: status === 'approved' ? '审核通过' : '已拒绝申请'
    };

  } catch (err) {
    console.error('审核失败:', err);
    return {
      success: false,
      error: err.message || '审核失败，请稍后重试'
    };
  }
};

