// 云函数：reviewCertification
// 统一的角色认证审核（支持设计者、施工方、社区工作者）
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
  const reviewerOpenid = wxContext.OPENID;

  try {
    const { applicationId, status, rejectReason } = event;

    // 验证参数
    if (!applicationId || !status) {
      return {
        success: false,
        error: '参数错误'
      };
    }

    if (!['approved', 'rejected'].includes(status)) {
      return {
        success: false,
        error: '状态参数错误'
      };
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
    const applicationType = user.data.certificationApplication.type;
    const certificationInfo = user.data.certificationApplication.info;
    
    console.log('🔍 准备审核认证申请，用户 openid:', userOpenid, '申请类型:', applicationType);

    // 如果审核通过，更新用户身份
    if (status === 'approved') {
      // 🔧 根据不同角色配置徽章
      let badge = {};
      let userTypeLabel = '';
      let profileUpdate = {};

      if (applicationType === 'communityWorker') {
        badge = {
          color: '#EF4444',
          icon: '🔴',
          text: '社区工作者'
        };
        userTypeLabel = '社区工作者';
        profileUpdate = {
          'profile.community': certificationInfo.community,
          'profile.position': certificationInfo.position,
          'profile.workId': certificationInfo.workId,
          'profile.certificationStatus': _.remove() // ✅ 清除认证状态
        };
      } else if (applicationType === 'designer') {
        badge = {
          color: '#10B981',
          icon: '🟢',
          text: '设计者'
        };
        userTypeLabel = '设计者';
        profileUpdate = {
          'profile.organization': certificationInfo.organization,
          'profile.title': certificationInfo.title,
          'profile.expertise': certificationInfo.expertise,
          'profile.certificationStatus': _.remove() // ✅ 清除认证状态
        };
      } else if (applicationType === 'contractor') {
        badge = {
          color: '#3B82F6',
          icon: '🔵',
          text: '施工方'
        };
        userTypeLabel = '施工方';
        profileUpdate = {
          'profile.companyName': certificationInfo.companyName,
          'profile.contactPerson': certificationInfo.contactPerson,
          'profile.serviceArea': certificationInfo.serviceArea,
          'profile.specialties': certificationInfo.specialties,
          'profile.certificationStatus': _.remove() // ✅ 清除认证状态
        };
      }

      // 更新用户信息：升级为对应角色
      await db.collection('users')
        .doc(applicationId)
        .update({
          data: {
            userType: applicationType,
            badge: badge,
            userTypeLabel: userTypeLabel,
            ...profileUpdate,
            'certificationApplication.status': 'approved',
            'certificationApplication.reviewTime': Date.now(),
            'certificationApplication.reviewerId': reviewerOpenid,
            certificationTime: Date.now(),
            updateTime: db.serverDate()
          }
        });

      console.log(`✅ 用户身份已更新为 ${userTypeLabel}:`, userOpenid);
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



