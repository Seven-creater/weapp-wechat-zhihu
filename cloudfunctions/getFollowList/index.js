// cloudfunctions/getFollowList/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取关注/粉丝列表
 * 解决客户端权限问题
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { type, userId } = event; // type: 'following' | 'followers'

  try {
    const targetUserId = userId || OPENID;

    let query;
    if (type === 'following') {
      // 查询我关注的人
      query = db.collection('follows')
        .where({ _openid: targetUserId })
        .orderBy('createTime', 'desc');
    } else if (type === 'followers') {
      // 查询关注我的人（粉丝）
      query = db.collection('follows')
        .where({ targetId: targetUserId })
        .orderBy('createTime', 'desc');
    } else {
      return {
        success: false,
        error: '参数错误：type 必须是 following 或 followers'
      };
    }

    const result = await query.get();

    console.log(`✅ 查询${type === 'following' ? '关注' : '粉丝'}列表成功，数量:`, result.data.length);

    return {
      success: true,
      data: result.data,
      count: result.data.length
    };

  } catch (err) {
    console.error('查询关注列表失败:', err);
    return {
      success: false,
      error: err.message || '查询失败'
    };
  }
};

