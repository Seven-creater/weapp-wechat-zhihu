// utils/time.js
// 统一的时间格式化工具函数

/**
 * 标准化日期对象
 * @param {Date|string|number|Object} value - 日期值
 * @returns {Date} 标准化后的日期对象
 */
function normalizeDate(value) {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  // 处理云数据库的日期对象
  if (value.toDate && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(0);
}

/**
 * 格式化时间为 YYYY-MM-DD HH:mm
 * @param {Date|string|number|Object} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = normalizeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 格式化时间为相对时间（刚刚、X分钟前、X小时前等）
 * @param {Date|string|number|Object} timestamp - 时间戳
 * @returns {string} 相对时间字符串
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  
  const date = normalizeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 7) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

/**
 * 格式化时间为简短格式（今天显示时间，其他显示日期）
 * @param {Date|string|number|Object} timestamp - 时间戳
 * @returns {string} 简短时间字符串
 */
function formatShortTime(timestamp) {
  if (!timestamp) return '';
  
  const date = normalizeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  
  const now = new Date();
  
  // 如果是今天，只显示时间
  if (date.toDateString() === now.toDateString()) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  
  // 否则显示日期
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 格式化时间为完整日期时间
 * @param {Date|string|number|Object} timestamp - 时间戳
 * @returns {string} 完整日期时间字符串
 */
function formatFullTime(timestamp) {
  if (!timestamp) return '';
  
  const date = normalizeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  normalizeDate,
  formatTime,
  formatRelativeTime,
  formatShortTime,
  formatFullTime
};

