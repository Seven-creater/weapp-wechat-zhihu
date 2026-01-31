// cloudfunctions/getUserContact/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取用户联系方式
 * 只有政府可以查看用户联系方式
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetId } = event;

  try {
    // 验证参数
    if (!targetId) {
      return {
        success: false,
        error: '用户ID不能为空'
      };
    }

    // 获取当前用户信息，检查权限
    const currentUserQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .get();

    if (!currentUserQuery.data || currentUserQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const currentUser = currentUserQuery.data[0];
    const userType = currentUser.userType || 'normal';

    // 检查权限：只有政府可以查看
    if (userType !== 'government') {
      return {
        success: false,
        error: '只有政府可以查看用户联系方式'
      };
    }

    // 获取目标用户的联系方式
    const targetUserQuery = await db.collection('users')
      .where({ _openid: targetId })
      .get();

    if (!targetUserQuery.data || targetUserQuery.data.length === 0) {
      return {
        success: false,
        error: '目标用户不存在'
      };
    }

    const targetUser = targetUserQuery.data[0];
    const profile = targetUser.profile || {};

    // 返回联系方式
    const contactData = {
      phoneNumber: targetUser.phoneNumber || '',
      wechat: profile.contactInfo || '',
      email: profile.email || '',
      organization: profile.organization || ''
    };

    console.log('政府查看联系方式:', OPENID, '查看目标:', targetId);

    return {
      success: true,
      data: contactData
    };

  } catch (err) {
    console.error('获取联系方式失败:', err);
    return {
      success: false,
      error: err.message || '获取失败'
    };
  }
};

