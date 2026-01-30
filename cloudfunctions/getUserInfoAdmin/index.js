// cloudfunctions/getUserInfoAdmin/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取用户完整信息（包含手机号）
 * 仅供后台管理使用
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { targetOpenid } = event;

  try {
    // 查询目标用户信息
    const openidToQuery = targetOpenid || OPENID;
    
    const userQuery = await db.collection('users')
      .where({
        _openid: openidToQuery
      })
      .limit(1)
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在',
      };
    }

    const user = userQuery.data[0];

    // 返回完整信息（包含手机号）
    return {
      success: true,
      data: {
        _id: user._id,
        _openid: user._openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        phoneNumber: user.phoneNumber, // 手机号（仅后台可见）
        createTime: user.createTime,
        updateTime: user.updateTime,
      },
    };

  } catch (err) {
    console.error('获取用户信息失败:', err);
    return {
      success: false,
      error: err.message || '获取失败',
    };
  }
};








