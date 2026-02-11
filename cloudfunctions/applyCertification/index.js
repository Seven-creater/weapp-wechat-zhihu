// 云函数：applyCertification
// 统一的认证申请（支持设计者、施工方等）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { userType, certificationInfo, nickName, avatarUrl, phoneNumber } = event;

    // 验证参数
    if (!userType || !certificationInfo) {
      return {
        success: false,
        error: '参数错误'
      };
    }

    // 验证用户类型
    const validTypes = ['designer', 'contractor', 'communityWorker'];
    if (!validTypes.includes(userType)) {
      return {
        success: false,
        error: '无效的用户类型'
      };
    }

    // 验证认证信息
    if (userType === 'contractor') {
      const { companyName, contactPerson, serviceArea, specialties } = certificationInfo;
      if (!companyName || !contactPerson || !serviceArea || !specialties) {
        return {
          success: false,
          error: '请填写完整的施工方认证信息'
        };
      }
    } else if (userType === 'designer') {
      const { organization, title, expertise } = certificationInfo;
      if (!organization || !title || !expertise) {
        return {
          success: false,
          error: '请填写完整的设计者认证信息'
        };
      }
    } else if (userType === 'communityWorker') {
      const { community, position, workId } = certificationInfo;
      if (!community || !position || !workId) {
        return {
          success: false,
          error: '请填写完整的社区工作者认证信息'
        };
      }
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
            type: userType,
            info: certificationInfo,  // ✅ 将认证信息放在 info 对象中
            status: 'pending',
            applyTime: Date.now(),
            reviewTime: null,
            reviewerId: null,
            rejectReason: null
          },
          updateTime: db.serverDate()
        }
      });

    console.log(`${userType} 认证申请已提交:`, openid);

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
