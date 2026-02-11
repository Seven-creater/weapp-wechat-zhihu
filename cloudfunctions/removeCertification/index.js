// 云函数：removeCertification
// 移除用户的认证身份（施工方、社区工作者、设计者）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 管理员账号
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  try {
    const { targetOpenid } = event;

    // 验证参数
    if (!targetOpenid) {
      return {
        success: false,
        error: '参数错误：缺少目标用户 openid'
      };
    }

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(adminOpenid)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以移除认证身份'
      };
    }

    // 查询目标用户
    const userRes = await db.collection('users')
      .where({ _openid: targetOpenid })
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userRes.data[0];
    const currentUserType = user.userType;

    // 检查用户是否有认证身份
    if (!currentUserType || currentUserType === 'resident' || currentUserType === 'normal') {
      return {
        success: false,
        error: '该用户没有认证身份'
      };
    }

    console.log('🗑️ 准备移除用户认证身份:', targetOpenid, '当前身份:', currentUserType);

    // 移除认证身份，恢复为普通用户
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          userType: 'resident',  // 恢复为普通居民
          badge: _.remove(),  // 移除徽章
          userTypeLabel: _.remove(),  // 移除身份标签
          certificationTime: _.remove(),  // 移除认证时间
          certificationApplication: _.remove(),  // 移除认证申请记录
          // 清除认证相关的 profile 字段
          'profile.community': _.remove(),
          'profile.position': _.remove(),
          'profile.workId': _.remove(),
          'profile.organization': _.remove(),
          'profile.title': _.remove(),
          'profile.expertise': _.remove(),
          'profile.companyName': _.remove(),
          'profile.contactPerson': _.remove(),
          'profile.serviceArea': _.remove(),
          'profile.specialties': _.remove(),
          'profile.certificationStatus': _.remove(),
          updateTime: db.serverDate()
        }
      });

    console.log('✅ 用户认证身份已移除:', targetOpenid, '原身份:', currentUserType);

    return {
      success: true,
      message: '认证身份已移除',
      removedType: currentUserType
    };

  } catch (err) {
    console.error('移除认证失败:', err);
    return {
      success: false,
      error: err.message || '移除失败，请稍后重试'
    };
  }
};

