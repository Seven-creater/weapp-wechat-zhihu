// cloudfunctions/verifyIssue/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 核实问题
 * 只有设计者、施工方、政府可以核实问题
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { postId } = event;

  try {
    // 验证参数
    if (!postId) {
      return {
        success: false,
        error: '帖子ID不能为空'
      };
    }

    // 获取当前用户信息，检查权限
    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userQuery.data[0];
    const userType = user.userType || 'normal';

    // 检查权限
    const allowedTypes = ['designer', 'contractor', 'government'];
    if (!allowedTypes.includes(userType)) {
      return {
        success: false,
        error: '您没有权限核实问题'
      };
    }

    // 更新帖子状态
    await db.collection('posts')
      .doc(postId)
      .update({
        data: {
          verified: true,
          verifiedBy: OPENID,
          verifiedByType: userType,
          verifiedAt: db.serverDate()
        }
      });

    console.log('问题核实成功:', postId, '核实人:', OPENID, '类型:', userType);

    return {
      success: true,
      message: '核实成功'
    };

  } catch (err) {
    console.error('核实问题失败:', err);
    return {
      success: false,
      error: err.message || '核实失败'
    };
  }
};

