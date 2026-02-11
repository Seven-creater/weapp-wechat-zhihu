// cloudfunctions/getUserPhone/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取用户手机号云函数
 * 仅社区工作者可调用，用于联系用户
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { userId } = event;

  try {
    // 1. 验证参数
    if (!userId) {
      return {
        success: false,
        error: '缺少用户ID'
      };
    }

    // 2. 验证调用者是社区工作者
    const callerRes = await db.collection('users')
      .where({ _openid: openid })
      .get();

    if (!callerRes.data || callerRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const caller = callerRes.data[0];

    if (caller.userType !== 'communityWorker') {
      return {
        success: false,
        error: '只有社区工作者可以查看用户手机号'
      };
    }

    // 3. 获取目标用户信息
    const userRes = await db.collection('users')
      .doc(userId)
      .get();

    if (!userRes.data) {
      return {
        success: false,
        error: '目标用户不存在'
      };
    }

    const user = userRes.data;

    // 4. 返回手机号
    return {
      success: true,
      phone: user.phone || '',
      nickName: user.nickName || '用户',
      avatarUrl: user.avatarUrl || ''
    };

  } catch (error) {
    console.error('获取用户手机号失败:', error);
    return {
      success: false,
      error: error.message || '获取失败，请重试'
    };
  }
};



