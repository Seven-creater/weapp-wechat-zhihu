// 云函数：applyGovCertification
// 提交政府用户认证申请
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { department, position, workId, nickName, avatarUrl, phoneNumber } = event;

    // 验证必填字段
    if (!department || !position || !workId) {
      return {
        success: false,
        error: '请填写完整的认证信息'
      };
    }

    // 检查是否已有待审核的申请
    const existingApplication = await db.collection('gov_certifications')
      .where({
        openid: openid,
        status: 'pending'
      })
      .get();

    if (existingApplication.data.length > 0) {
      return {
        success: false,
        error: '您已有待审核的申请，请等待审核结果'
      };
    }

    // 创建认证申请
    const result = await db.collection('gov_certifications').add({
      data: {
        openid: openid,
        nickName: nickName,
        avatarUrl: avatarUrl,
        phoneNumber: phoneNumber,
        department: department,
        position: position,
        workId: workId,
        status: 'pending', // pending, approved, rejected
        applyTime: Date.now(),
        reviewTime: null,
        reviewerId: null,
        rejectReason: null
      }
    });

    console.log('认证申请创建成功:', result._id);

    return {
      success: true,
      applicationId: result._id,
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

