// 無界营造 - 数据加密存储模块
// utils/storage.js

/**
 * 简单的加密函数（Base64 + 混淆）
 * 注意：这只是基础加密，敏感数据应使用服务端加密
 */
function encrypt(data) {
  try {
    const jsonStr = JSON.stringify(data);
    const base64 = wx.arrayBufferToBase64(
      new TextEncoder().encode(jsonStr)
    );
    // 简单混淆：反转字符串
    return base64.split('').reverse().join('');
  } catch (err) {
    console.error('加密失败:', err);
    return null;
  }
}

/**
 * 简单的解密函数
 */
function decrypt(encryptedData) {
  try {
    // 反转回来
    const base64 = encryptedData.split('').reverse().join('');
    const buffer = wx.base64ToArrayBuffer(base64);
    const jsonStr = new TextDecoder().decode(buffer);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('解密失败:', err);
    return null;
  }
}

/**
 * 安全存储数据
 * @param {string} key - 键名
 * @param {any} data - 数据
 * @param {boolean} encrypt - 是否加密
 */
function setStorage(key, data, needEncrypt = false) {
  try {
    const value = needEncrypt ? encrypt(data) : data;
    wx.setStorageSync(key, value);
    return true;
  } catch (err) {
    console.error('存储失败:', err);
    return false;
  }
}

/**
 * 安全获取数据
 * @param {string} key - 键名
 * @param {boolean} decrypt - 是否解密
 * @returns {any}
 */
function getStorage(key, needDecrypt = false) {
  try {
    const value = wx.getStorageSync(key);
    if (!value) return null;
    return needDecrypt ? decrypt(value) : value;
  } catch (err) {
    console.error('获取数据失败:', err);
    return null;
  }
}

/**
 * 删除数据
 * @param {string} key - 键名
 */
function removeStorage(key) {
  try {
    wx.removeStorageSync(key);
    return true;
  } catch (err) {
    console.error('删除数据失败:', err);
    return false;
  }
}

/**
 * 清空所有数据
 */
function clearStorage() {
  try {
    wx.clearStorageSync();
    return true;
  } catch (err) {
    console.error('清空数据失败:', err);
    return false;
  }
}

/**
 * 存储用户信息（加密）
 * @param {Object} userInfo - 用户信息
 */
function setUserInfo(userInfo) {
  return setStorage('userInfo', userInfo, false); // 用户信息不加密，方便读取
}

/**
 * 获取用户信息
 * @returns {Object|null}
 */
function getUserInfo() {
  return getStorage('userInfo', false);
}

/**
 * 存储 openid（加密）
 * @param {string} openid
 */
function setOpenid(openid) {
  return setStorage('openid', openid, true); // openid 加密存储
}

/**
 * 获取 openid
 * @returns {string|null}
 */
function getOpenid() {
  return getStorage('openid', true);
}

/**
 * 存储 token（加密）
 * @param {string} token
 */
function setToken(token) {
  return setStorage('token', token, true);
}

/**
 * 获取 token
 * @returns {string|null}
 */
function getToken() {
  return getStorage('token', true);
}

/**
 * 清除用户相关数据
 */
function clearUserData() {
  removeStorage('userInfo');
  removeStorage('openid');
  removeStorage('token');
}

module.exports = {
  encrypt,
  decrypt,
  setStorage,
  getStorage,
  removeStorage,
  clearStorage,
  setUserInfo,
  getUserInfo,
  setOpenid,
  getOpenid,
  setToken,
  getToken,
  clearUserData,
};









