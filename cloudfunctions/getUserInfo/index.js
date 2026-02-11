// cloudfunctions/getUserInfo/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { targetId } = event;
  
  if (!targetId) {
    return {
      success: false,
      error: '缺少 targetId 参数'
    };
  }

  try {
    // 在云函数中查询，不受客户端权限限制
    const res = await db.collection('users').where({
      _openid: targetId
    }).field({
      userInfo: true,
      stats: true,
      userType: true,      // 🔧 添加用户类型
      badge: true,         // 🔧 添加徽章
      profile: true,       // 🔧 添加补充信息
      reputation: true,    // 🔧 添加信誉信息
      phoneNumber: true,   // 🔧 添加手机号
      _openid: true
    }).get();

    if (res.data.length > 0) {
      const userData = res.data[0];
      
      // ✅ 不转换云存储 URL，直接返回 cloud:// 地址
      // 小程序会自动处理云存储地址的显示，无需转换为临时链接
      // 如果头像URL为空或无效，使用默认头像
      if (userData.userInfo && (!userData.userInfo.avatarUrl || userData.userInfo.avatarUrl.trim() === '')) {
        userData.userInfo.avatarUrl = '/images/zhi.png';
      }
      
      return {
        success: true,
        data: {
          userInfo: userData.userInfo,
          stats: userData.stats,
          userType: userData.userType || 'normal',
          badge: userData.badge || null,
          profile: userData.profile || {},
          reputation: userData.reputation || null,
          phoneNumber: userData.phoneNumber || null,
          _openid: userData._openid
        },
        // 兼容旧代码
        userInfo: userData.userInfo,
        _openid: userData._openid,
        stats: userData.stats
      };
    } else {
      return {
        success: false,
        error: '用户不存在'
      };
    }
  } catch (err) {
    console.error('查询用户信息失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
