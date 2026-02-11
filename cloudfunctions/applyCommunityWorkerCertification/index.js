// 云函数：applyCommunityWorkerCertification
// 提交社区工作者认证申请（存储在 users 集合中）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { community, position, workId, nickName, avatarUrl, phoneNumber } = event;

    // 验证必填字段
    if (!community || !position || !workId) {
      return {
        success: false,
        error: '请填写完整的认证信息'
      };
    }

    // 查询用户是否存在
    const userQuery = await db.collection('users')
      .where({ _openid: openid })
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在，请先完成注册'
      };
    }

    const user = userQuery.data[0];

    // 检查是否已有待审核的申请
    if (user.certificationApplication && user.certificationApplication.status === 'pending') {
      return {
        success: false,
        error: '您已有待审核的申请，请等待审核结果'
      };
    }

    // ✅ 更新用户记录，添加认证申请信息（统一数据结构）
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          certificationApplication: {
            type: 'communityWorker',
            info: {  // ✅ 将认证信息放在 info 对象中
              community: community,
              position: position,
              workId: workId
            },
            status: 'pending', // pending, approved, rejected
            applyTime: Date.now(),
            reviewTime: null,
            reviewerId: null,
            rejectReason: null
          },
          updateTime: db.serverDate()
        }
      });

    console.log('社区工作者认证申请已提交:', openid);

    return {
      success: true,
      message: '认证申请已提交，请等待审核'
    };

  } catch (err) {
    console.error('提交认证申请失败:', err);
    return {
      success: false,
      error: err.message || '提交失败，请稍后重试'
    };
  }
};

