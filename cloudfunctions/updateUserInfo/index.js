// cloudfunctions/updateUserInfo/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 用户类型配置
const USER_TYPE_CONFIG = {
  normal: {
    badge: { color: '#6B7280', icon: '👤', text: '用户' },
    permissions: {
      canVerifyIssue: false,
      canCreateProject: false,
      canPublishPolicy: false,
      canProvideConsultation: false,
      canDesignSolution: false,
      canUpdateProgress: false,
      canViewUserContact: false
    }
  },
  designer: {
    badge: { color: '#10B981', icon: '🟢', text: '设计者' },
    permissions: {
      canVerifyIssue: true,
      canCreateProject: false,
      canPublishPolicy: false,
      canProvideConsultation: true,
      canDesignSolution: true,
      canUpdateProgress: false,
      canViewUserContact: false
    }
  },
  contractor: {
    badge: { color: '#3B82F6', icon: '🔵', text: '施工方' },
    permissions: {
      canVerifyIssue: true,
      canCreateProject: true,
      canPublishPolicy: false,
      canProvideConsultation: true,
      canDesignSolution: false,
      canUpdateProgress: true,
      canViewUserContact: false
    }
  },
  government: {
    badge: { color: '#EF4444', icon: '🔴', text: '政府' },
    needCertification: true,
    permissions: {
      canVerifyIssue: true,
      canCreateProject: true,
      canPublishPolicy: true,
      canProvideConsultation: true,
      canDesignSolution: false,
      canUpdateProgress: false,
      canViewUserContact: true
    }
  }
};

/**
 * 更新用户信息
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { nickName, avatarUrl, phoneNumber, userType, profile } = event;

  try {
    // 🔧 查询用户是否存在（先查询，以便获取现有数据）
    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .get();
    
    const existingUser = userQuery.data && userQuery.data.length > 0 ? userQuery.data[0] : null;
    
    // 验证参数
    if (!nickName || !nickName.trim()) {
      // 🔧 如果没有传递昵称，尝试使用现有昵称
      if (existingUser && existingUser.userInfo && existingUser.userInfo.nickName) {
        // 使用现有昵称，继续执行
      } else {
        return {
          success: false,
          error: '昵称不能为空',
        };
      }
    }

    // 昵称长度限制
    if (nickName && nickName.length > 20) {
      return {
        success: false,
        error: '昵称不能超过20个字符',
      };
    }

    // 🔧 验证手机号（只在首次注册或明确传递时验证）
    if (phoneNumber) {
      // 验证手机号格式
      const phoneReg = /^1[3-9]\d{9}$/;
      if (!phoneReg.test(phoneNumber)) {
        return {
          success: false,
          error: '手机号格式不正确',
        };
      }
    } else if (!existingUser) {
      // 新用户必须提供手机号
      return {
        success: false,
        error: '手机号不能为空',
      };
    }

    // 🆕 获取用户类型配置
    const typeId = userType || 'normal';
    const typeConfig = USER_TYPE_CONFIG[typeId] || USER_TYPE_CONFIG.normal;

    // 🆕 如果是政府类型但未认证，默认为普通用户
    const finalTypeId = (typeId === 'government' && !event.isCertified) ? 'normal' : typeId;
    const finalTypeConfig = USER_TYPE_CONFIG[finalTypeId] || USER_TYPE_CONFIG.normal;

    // 🔧 使用现有数据或新数据
    const finalNickName = nickName ? nickName.trim() : (existingUser ? existingUser.userInfo.nickName : '未命名用户');
    const finalAvatarUrl = avatarUrl || (existingUser ? existingUser.userInfo.avatarUrl : '/images/zhi.png');
    const finalPhoneNumber = phoneNumber || (existingUser ? existingUser.phoneNumber : '');

    // 公开的用户信息（不包含手机号）
    const publicUserInfo = {
      nickName: finalNickName,
      avatarUrl: finalAvatarUrl,
    };

    if (existingUser) {
      // 用户已存在，更新信息
      const userId = existingUser._id;
      
      // 🔧 构建更新数据（只更新传递的字段）
      const updateData = {
        userInfo: publicUserInfo, // 公开信息（用于其他用户查看）
        updateTime: db.serverDate(),
      };
      
      // 🔧 只在明确传递了 userType 时才更新类型和徽章
      if (userType && userType !== existingUser.userType) {
        updateData.userType = finalTypeId;
        updateData.userTypeLabel = finalTypeConfig.badge.text;
        updateData.badge = finalTypeConfig.badge;
        updateData.permissions = finalTypeConfig.permissions;
        console.log('🔄 更新用户类型:', existingUser.userType, '->', finalTypeId);
      } else {
        // 保持原有类型，不更新徽章
        console.log('✓ 保持原有用户类型:', existingUser.userType);
      }
      
      // 🔧 只在提供了手机号时更新
      if (phoneNumber) {
        updateData.phoneNumber = finalPhoneNumber;
      }
      
      // 🔧 只在提供了 profile 时更新
      if (profile !== undefined) {
        updateData.profile = profile;
      }
      
      await db.collection('users')
        .doc(userId)
        .update({
          data: updateData
        });

      console.log('用户信息更新成功:', OPENID);
      
      // 🔧 返回实际的用户类型和徽章（不是计算出来的）
      const actualUserType = updateData.userType || existingUser.userType || 'normal';
      const actualBadge = updateData.badge || existingUser.badge || USER_TYPE_CONFIG[actualUserType].badge;
      
      return {
        success: true,
        userInfo: publicUserInfo,
        userType: actualUserType,
        badge: actualBadge,
      };
    } else {
      // 用户不存在，创建新用户
      // 🔧 新用户必须提供手机号
      if (!finalPhoneNumber) {
        return {
          success: false,
          error: '新用户必须提供手机号'
        };
      }
      
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          userInfo: publicUserInfo, // 公开信息（用于其他用户查看）
          phoneNumber: finalPhoneNumber, // 手机号（私密，仅管理员可见）
          userType: finalTypeId,    // 🆕 用户类型
          userTypeLabel: finalTypeConfig.badge.text, // 🆕 类型标签
          badge: finalTypeConfig.badge, // 🆕 徽章信息
          permissions: finalTypeConfig.permissions, // 🆕 权限配置
          profile: profile || {},   // 🆕 补充信息
          stats: {
            followingCount: 0,
            followersCount: 0,
            likesCount: 0
          },
          reputation: {             // 🆕 信誉系统
            rating: 5.0,
            reviewCount: 0,
            completedTasks: 0,
            helpfulCount: 0,
            responseRate: 100,
            responseTime: 0
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
      userType: finalTypeId,    // 🆕 返回用户类型
      badge: finalTypeConfig.badge, // 🆕 返回徽章信息
    };

  } catch (err) {
    console.error('更新用户信息失败:', err);
    return {
      success: false,
      error: err.message || '更新失败',
    };
  }
};
