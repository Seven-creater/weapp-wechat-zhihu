// 無界营造 - 权限管理模块
// utils/permission.js

const app = getApp();

/**
 * 权限类型枚举
 */
const PERMISSION_TYPES = {
  LOCATION: 'scope.userLocation',
  CAMERA: 'scope.camera',
  ALBUM: 'scope.album',
  RECORD: 'scope.record',
  WRITE_PHOTOS_ALBUM: 'scope.writePhotosAlbum',
};

/**
 * 检查权限
 * @param {string} scope - 权限类型
 * @returns {Promise<boolean>}
 */
function checkPermission(scope) {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        resolve(!!res.authSetting[scope]);
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

/**
 * 请求权限
 * @param {string} scope - 权限类型
 * @returns {Promise<boolean>}
 */
function requestPermission(scope) {
  return new Promise((resolve, reject) => {
    wx.authorize({
      scope: scope,
      success: () => {
        resolve(true);
      },
      fail: () => {
        // 用户拒绝授权，引导用户打开设置
        wx.showModal({
          title: '需要授权',
          content: '请在设置中开启相关权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  resolve(!!settingRes.authSetting[scope]);
                },
                fail: () => {
                  resolve(false);
                }
              });
            } else {
              resolve(false);
            }
          }
        });
      }
    });
  });
}

/**
 * 确保有权限（检查并请求）
 * @param {string} scope - 权限类型
 * @returns {Promise<boolean>}
 */
async function ensurePermission(scope) {
  const hasPermission = await checkPermission(scope);
  if (hasPermission) {
    return true;
  }
  return await requestPermission(scope);
}

/**
 * 检查位置权限
 * @returns {Promise<boolean>}
 */
function checkLocationPermission() {
  return checkPermission(PERMISSION_TYPES.LOCATION);
}

/**
 * 请求位置权限
 * @returns {Promise<boolean>}
 */
function requestLocationPermission() {
  return ensurePermission(PERMISSION_TYPES.LOCATION);
}

/**
 * 检查相机权限
 * @returns {Promise<boolean>}
 */
function checkCameraPermission() {
  return checkPermission(PERMISSION_TYPES.CAMERA);
}

/**
 * 请求相机权限
 * @returns {Promise<boolean>}
 */
function requestCameraPermission() {
  return ensurePermission(PERMISSION_TYPES.CAMERA);
}

/**
 * 检查相册权限
 * @returns {Promise<boolean>}
 */
function checkAlbumPermission() {
  return checkPermission(PERMISSION_TYPES.ALBUM);
}

/**
 * 请求相册权限
 * @returns {Promise<boolean>}
 */
function requestAlbumPermission() {
  return ensurePermission(PERMISSION_TYPES.ALBUM);
}

/**
 * 检查录音权限
 * @returns {Promise<boolean>}
 */
function checkRecordPermission() {
  return checkPermission(PERMISSION_TYPES.RECORD);
}

/**
 * 请求录音权限
 * @returns {Promise<boolean>}
 */
function requestRecordPermission() {
  return ensurePermission(PERMISSION_TYPES.RECORD);
}

// ========================================
// 🆕 用户角色权限管理
// ========================================

/**
 * 用户角色权限配置
 */
const USER_PERMISSIONS = {
  // 核实问题
  canVerifyIssue: ['designer', 'contractor', 'government'],
  // 创建项目
  canCreateProject: ['contractor', 'government'],
  // 发布政策
  canPublishPolicy: ['government'],
  // 提供咨询
  canProvideConsultation: ['designer', 'contractor', 'government'],
  // 设计方案
  canDesignSolution: ['designer'],
  // 更新施工进度
  canUpdateProgress: ['contractor'],
  // 查看用户联系方式
  canViewUserContact: ['government']
};

/**
 * 获取当前用户类型
 * @returns {string} 用户类型 ID
 */
function getCurrentUserType() {
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  return userInfo?.userType || 'normal';
}

/**
 * 检查当前用户是否有某个权限
 * @param {string} permission - 权限名称
 * @returns {boolean}
 */
function hasPermission(permission) {
  const userType = getCurrentUserType();
  const allowedTypes = USER_PERMISSIONS[permission] || [];
  return allowedTypes.includes(userType);
}

/**
 * 检查当前用户是否为设计者
 * @returns {boolean}
 */
function isDesigner() {
  return getCurrentUserType() === 'designer';
}

/**
 * 检查当前用户是否为施工方
 * @returns {boolean}
 */
function isContractor() {
  return getCurrentUserType() === 'contractor';
}

/**
 * 检查当前用户是否为政府
 * @returns {boolean}
 */
function isGovernment() {
  return getCurrentUserType() === 'government';
}

/**
 * 检查当前用户是否为普通用户
 * @returns {boolean}
 */
function isNormalUser() {
  return getCurrentUserType() === 'normal';
}

/**
 * 检查当前用户是否为专业用户（设计者、施工方、政府）
 * @returns {boolean}
 */
function isProfessionalUser() {
  const userType = getCurrentUserType();
  return ['designer', 'contractor', 'government'].includes(userType);
}

/**
 * 权限检查失败时的提示
 * @param {string} permission - 权限名称
 */
function showPermissionDenied(permission) {
  const messages = {
    canVerifyIssue: '只有设计者、施工方或政府可以核实问题',
    canCreateProject: '只有施工方或政府可以创建项目',
    canPublishPolicy: '只有政府可以发布政策',
    canProvideConsultation: '只有专业用户可以提供咨询',
    canDesignSolution: '只有设计者可以设计方案',
    canUpdateProgress: '只有施工方可以更新施工进度',
    canViewUserContact: '只有政府可以查看用户联系方式'
  };
  
  const message = messages[permission] || '您没有此操作权限';
  
  wx.showModal({
    title: '权限不足',
    content: message + '\n\n您可以在"我的-切换身份"中切换身份',
    confirmText: '去切换',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({
          url: '/pages/switch-identity/index'
        });
      }
    }
  });
}

/**
 * 检查权限并执行操作
 * @param {string} permission - 权限名称
 * @param {Function} callback - 有权限时执行的回调
 * @returns {boolean} 是否有权限
 */
function checkAndExecute(permission, callback) {
  if (hasPermission(permission)) {
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  } else {
    showPermissionDenied(permission);
    return false;
  }
}

/**
 * 获取用户类型的显示名称
 * @param {string} userType - 用户类型 ID
 * @returns {string}
 */
function getUserTypeLabel(userType) {
  const labels = {
    normal: '普通用户',
    designer: '设计者',
    contractor: '施工方',
    government: '政府'
  };
  return labels[userType] || '未知';
}

module.exports = {
  PERMISSION_TYPES,
  checkPermission,
  requestPermission,
  ensurePermission,
  checkLocationPermission,
  requestLocationPermission,
  checkCameraPermission,
  requestCameraPermission,
  checkAlbumPermission,
  requestAlbumPermission,
  checkRecordPermission,
  requestRecordPermission,
  
  // 🆕 用户角色权限
  USER_PERMISSIONS,
  getCurrentUserType,
  hasPermission,
  isDesigner,
  isContractor,
  isGovernment,
  isNormalUser,
  isProfessionalUser,
  showPermissionDenied,
  checkAndExecute,
  getUserTypeLabel
};









