// 云函数：reviewCommunityWorkerCertification
// 审核社区工作者认证申请（从 users 集合读取和更新）
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

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(reviewerOpenid)) {
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

