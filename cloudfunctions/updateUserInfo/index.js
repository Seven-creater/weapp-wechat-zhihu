// cloudfunctions/updateUserInfo/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 更新用户信息
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { nickName, avatarUrl, phoneNumber } = event;

  try {
    // 验证参数
    if (!nickName || !nickName.trim()) {
      return {
        success: false,
        error: '昵称不能为空',
      };
    }

    // 昵称长度限制
    if (nickName.length > 20) {
      return {
        success: false,
        error: '昵称不能超过20个字符',
      };
    }

    // 验证手机号（必填）
    if (!phoneNumber) {
      return {
        success: false,
        error: '手机号不能为空',
      };
    }

    // 验证手机号格式
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(phoneNumber)) {
      return {
        success: false,
        error: '手机号格式不正确',
      };
    }

    // 公开的用户信息（不包含手机号）
    const publicUserInfo = {
      nickName: nickName.trim(),
      avatarUrl: avatarUrl || '/images/zhi.png',
    };

    // 查询用户是否存在
    const userQuery = await db.collection('users')
      .where({
        _openid: OPENID
      })
      .get();

    if (userQuery.data && userQuery.data.length > 0) {
      // 用户已存在，更新信息
      const userId = userQuery.data[0]._id;
      
      await db.collection('users')
        .doc(userId)
        .update({
          data: {
            userInfo: publicUserInfo, // 公开信息（用于其他用户查看）
            phoneNumber: phoneNumber, // 手机号（私密，仅管理员可见）
            stats: userQuery.data[0].stats || {
              followingCount: 0,
              followersCount: 0,
              likesCount: 0
            },
            updateTime: db.serverDate(),
          }
        });

      console.log('用户信息更新成功:', OPENID);
    } else {
      // 用户不存在，创建新用户
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          userInfo: publicUserInfo, // 公开信息（用于其他用户查看）
          phoneNumber: phoneNumber, // 手机号（私密，仅管理员可见）
          stats: {
            followingCount: 0,
            followersCount: 0,
            likesCount: 0
          },
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
        }
      });

      console.log('新用户创建成功:', OPENID);
    }

    // 只返回公开信息，不返回手机号
    return {
      success: true,
      userInfo: publicUserInfo, // 注意：不包含 phoneNumber
    };

  } catch (err) {
    console.error('更新用户信息失败:', err);
    return {
      success: false,
      error: err.message || '更新失败',
    };
  }
};
