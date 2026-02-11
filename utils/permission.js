// utils/permission.js
// 权限检查工具模块
const app = getApp();
const { hasPermission: checkPermission } = require('./userTypes.js');

/**
 * 获取当前用户类型
 */
function getUserType() {
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  return userInfo?.userType || 'normal';
}

/**
 * 获取当前用户 openid
 */
function getOpenid() {
  return app.globalData.openid || wx.getStorageSync('openid');
}

/**
 * 检查是否有某个权限
 * @param {string} permission - 权限名称
 * @returns {boolean}
 */
function hasPermission(permission) {
  const userType = getUserType();
  return checkPermission(userType, permission);
}

/**
 * 检查权限并执行操作
 * @param {string} permission - 权限名称
 * @param {function} callback - 有权限时执行的回调函数
 */
function checkAndExecute(permission, callback) {
  if (hasPermission(permission)) {
    callback();
  } else {
    wx.showToast({
      title: '您没有此操作权限',
      icon: 'none'
    });
  }
}

/**
 * 检查是否可以添加设计方案
 * @param {object} post - 帖子对象
 * @returns {boolean}
 */
function canAddDesignSolution(post) {
  const userType = getUserType();
  
  // 必须是设计者
  if (userType !== 'designer') {
    return false;
}

  // 帖子必须是待处理状态
  if (post.status !== 'pending') {
    return false;
  }
  
  return true;
}

/**
 * 检查是否可以创建施工项目
 * @param {object} post - 帖子对象
 * @returns {boolean}
 */
function canCreateProject(post) {
  const userType = getUserType();
  
  // 必须是施工方
  if (userType !== 'contractor') {
    return false;
  }
  
  // 帖子必须是待处理状态
  if (post.status !== 'pending') {
    return false;
  }
  
  // 不能已有施工项目
  if (post.constructionProject && post.constructionProject.projectId) {
    return false;
  }
  
  return true;
}

/**
 * 检查是否可以更新施工进度
 * @param {object} project - 项目对象
 * @returns {boolean}
 */
function canUpdateProgress(project) {
  const userType = getUserType();
  const openid = getOpenid();
  
  // 社区工作者可以更新任何项目
  if (userType === 'communityWorker') {
    return true;
  }
  
  // 必须是该项目的施工方
  if (userType === 'contractor' && project.constructorId === openid) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否可以确认完工
 * @param {object} post - 帖子对象
 * @returns {boolean}
 */
function canConfirmCompletion(post) {
  const userType = getUserType();
  const openid = getOpenid();
  
  // 社区工作者可以确认任何项目
  if (userType === 'communityWorker') {
    return true;
  }
  
  // 发帖者可以确认自己的项目
  if (post._openid === openid) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否可以查看联系方式
 * @returns {boolean}
 */
function canViewContact() {
  const userType = getUserType();
  return userType === 'communityWorker';
}

/**
 * 检查是否是当前用户
 * @param {string} targetOpenid - 目标用户的 openid
 * @returns {boolean}
 */
function isCurrentUser(targetOpenid) {
  const openid = getOpenid();
  return openid && openid === targetOpenid;
}

/**
 * 获取帖子状态的中文描述
 * @param {string} status - 状态
 * @returns {string}
 */
function getStatusText(status) {
  const statusMap = {
    'pending': '待处理',
    'in_progress': '处理中',
    'completed': '已完成'
  };
  return statusMap[status] || '未知';
}

/**
 * 获取帖子状态的颜色
 * @param {string} status - 状态
 * @returns {string}
 */
function getStatusColor(status) {
  const colorMap = {
    'pending': '#F59E0B',      // 橙色
    'in_progress': '#3B82F6',  // 蓝色
    'completed': '#10B981'     // 绿色
  };
  return colorMap[status] || '#6B7280';
}

module.exports = {
  getUserType,
  getOpenid,
  hasPermission,
  checkAndExecute,
  canAddDesignSolution,
  canCreateProject,
  canUpdateProgress,
  canConfirmCompletion,
  canViewContact,
  isCurrentUser,
  getStatusText,
  getStatusColor
};
