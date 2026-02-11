// cloudfunctions/createDailyPost/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { content, images, location, formattedAddress } = event;

    // 验证必填字段
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: '内容不能为空'
      };
    }

    // 获取用户信息
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get();

    const userData = userResult.data[0] || {};
    
    // 从 userInfo 对象中获取头像和昵称
    const userInfo = userData.userInfo || {};
    const avatarUrl = userInfo.avatarUrl || '/images/zhi.png';
    const nickName = userInfo.nickName || '微信用户';
    const userType = userData.userType || 'resident';

    // 创建日常帖子
    const postData = {
      _openid: openid,  // ✅ 保存作者的 openid
      type: 'daily',  // 日常帖类型
      content: content.trim(),
      images: images || [],
      location: location || null,
      formattedAddress: formattedAddress || '',
      userInfo: {
        nickName: nickName,
        avatarUrl: avatarUrl
      },
      userType: userType,
      stats: {
        like: 0,
        comment: 0,
        collect: 0
      },
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('posts').add({
      data: postData
    });

    return {
      success: true,
      postId: result._id,
      message: '发布成功'
    };

  } catch (err) {
    console.error('创建日常帖失败:', err);
    return {
      success: false,
      error: err.message || '发布失败'
    };
  }
};
