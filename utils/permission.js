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
};









