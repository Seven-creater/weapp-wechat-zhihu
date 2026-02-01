// 云函数：removeCommunityWorkerCertification
// 移除社区工作者身份（从 users 集合更新）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 你的管理员账号（正确的 openid）
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  try {
    const { userOpenid } = event;

    // 验证参数
    if (!userOpenid) {
      return {
        success: false,
        error: '参数错误'
      };
    }

    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(adminOpenid)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以移除社区工作者身份'
      };
    }

    console.log('🔍 准备移除社区工作者身份，openid:', userOpenid);

    // 🔧 普通用户徽章配置
    const normalBadge = {
      color: '#6B7280',
      icon: '👤',
      text: '用户'
    };

    // 查询用户
    const userQuery = await db.collection('users')
      .where({ _openid: userOpenid })
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userQuery.data[0];

    // 更新用户信息：降级为普通用户
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          userType: 'normal',
          badge: normalBadge,
          userTypeLabel: '普通用户',
          'profile.community': null,
          'profile.position': null,
          'profile.workId': null,
          'certificationApplication.status': 'removed',
          certificationTime: null,
          updateTime: db.serverDate()
        }
      });

    console.log('✅ 已移除社区工作者身份:', userOpenid);

    return {
      success: true,
      message: '已移除社区工作者身份'
    };

  } catch (err) {
    console.error('移除身份失败:', err);
    return {
      success: false,
      error: err.message || '操作失败，请稍后重试'
    };
  }
};

