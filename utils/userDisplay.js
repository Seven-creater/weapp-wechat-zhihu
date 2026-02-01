// utils/userDisplay.js
// 用户显示相关的工具函数

/**
 * 获取用户类型的徽章配置
 * @param {string} userType - 用户类型
 * @returns {object} 徽章配置
 */
function getUserBadge(userType) {
  const badges = {
    normal: {
      color: '#6B7280',
      icon: '👤',
      text: '用户'
    },
    designer: {
      color: '#10B981',
      icon: '🟢',
      text: '设计者'
    },
    contractor: {
      color: '#3B82F6',
      icon: '🔵',
      text: '施工方'
    },
    communityWorker: {
      color: '#EF4444',
      icon: '🔴',
      text: '社区工作者'
    }
  };
  
  return badges[userType] || badges.normal;
}

/**
 * 格式化用户昵称（添加身份标识）
 * @param {string} nickName - 用户昵称
 * @param {string} userType - 用户类型
 * @param {boolean} showIcon - 是否显示图标
 * @returns {string} 格式化后的昵称
 */
function formatUserName(nickName, userType, showIcon = true) {
  if (!nickName) return '未知用户';
  if (!userType || userType === 'normal') return nickName;
  
  const badge = getUserBadge(userType);
  const icon = showIcon ? badge.icon : '';
  
  return `${nickName} ${icon}${badge.text}`;
}

/**
 * 获取用户显示信息（包含徽章）
 * @param {object} userInfo - 用户信息对象
 * @returns {object} 包含格式化昵称和徽章的对象
 */
function getUserDisplayInfo(userInfo) {
  if (!userInfo) {
    return {
      nickName: '未知用户',
      displayName: '未知用户',
      badge: null,
      userType: 'normal'
    };
  }
  
  const nickName = userInfo.nickName || '未知用户';
  const userType = userInfo.userType || 'normal';
  const badge = getUserBadge(userType);
  
  return {
    nickName: nickName,
    displayName: formatUserName(nickName, userType, true),
    badge: badge,
    userType: userType
  };
}

module.exports = {
  getUserBadge,
  formatUserName,
  getUserDisplayInfo
};



