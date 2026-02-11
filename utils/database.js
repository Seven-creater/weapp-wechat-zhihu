// utils/database.js
// 统一的数据库工具函数

let db = null;
let _ = null;

/**
 * 获取数据库实例（延迟初始化）
 * @returns {Object} { db, _ } 数据库实例和命令对象
 */
function getDB() {
  if (!db) {
    db = wx.cloud.database();
    _ = db.command;
  }
  return { db, _ };
}

/**
 * 检查是否是集合不存在错误
 * @param {Error} err - 错误对象
 * @returns {boolean} 是否是集合不存在错误
 */
function isCollectionNotExistError(err) {
  if (!err) return false;
  const msg = String(err.errMsg || err.message || '');
  const code = err.errCode || err.code;
  if (code === -502005 || code === 502005) return true;
  return msg.includes('collection not exist') || 
         msg.includes('DATABASE_COLLECTION_NOT_EXIST');
}

/**
 * 安全查询（集合不存在时返回空数组）
 * @param {string} collectionName - 集合名称
 * @param {Object} query - 查询条件
 * @returns {Promise<Array>} 查询结果
 */
async function safeQuery(collectionName, query = {}) {
  const { db } = getDB();
  try {
    const res = await db.collection(collectionName).where(query).get();
    return res.data || [];
  } catch (err) {
    if (isCollectionNotExistError(err)) {
      console.warn(`集合 ${collectionName} 不存在，返回空数组`);
      return [];
    }
    throw err;
  }
}

/**
 * 安全计数（集合不存在时返回0）
 * @param {string} collectionName - 集合名称
 * @param {Object} query - 查询条件
 * @returns {Promise<number>} 计数结果
 */
async function safeCount(collectionName, query = {}) {
  const { db } = getDB();
  try {
    const res = await db.collection(collectionName).where(query).count();
    return res.total || 0;
  } catch (err) {
    if (isCollectionNotExistError(err)) {
      console.warn(`集合 ${collectionName} 不存在，返回0`);
      return 0;
    }
    throw err;
  }
}

module.exports = {
  getDB,
  isCollectionNotExistError,
  safeQuery,
  safeCount
};
