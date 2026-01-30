// 無界营造 - 数据库操作模块
// utils/database.js

const app = getApp();

/**
 * 获取数据库实例
 */
function getDB() {
  return wx.cloud.database();
}

/**
 * 获取集合
 * @param {string} collectionName - 集合名称
 */
function getCollection(collectionName) {
  return getDB().collection(collectionName);
}

/**
 * 添加文档
 * @param {string} collectionName - 集合名称
 * @param {Object} data - 数据
 * @returns {Promise}
 */
function addDocument(collectionName, data) {
  const db = getDB();
  return getCollection(collectionName).add({
    data: {
      ...data,
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
    }
  });
}

/**
 * 更新文档
 * @param {string} collectionName - 集合名称
 * @param {string} docId - 文档 ID
 * @param {Object} data - 数据
 * @returns {Promise}
 */
function updateDocument(collectionName, docId, data) {
  const db = getDB();
  return getCollection(collectionName).doc(docId).update({
    data: {
      ...data,
      updateTime: db.serverDate(),
    }
  });
}

/**
 * 删除文档
 * @param {string} collectionName - 集合名称
 * @param {string} docId - 文档 ID
 * @returns {Promise}
 */
function deleteDocument(collectionName, docId) {
  return getCollection(collectionName).doc(docId).remove();
}

/**
 * 获取文档
 * @param {string} collectionName - 集合名称
 * @param {string} docId - 文档 ID
 * @returns {Promise}
 */
function getDocument(collectionName, docId) {
  return getCollection(collectionName).doc(docId).get();
}

/**
 * 查询文档列表
 * @param {string} collectionName - 集合名称
 * @param {Object} options - 查询选项
 * @returns {Promise}
 */
function queryDocuments(collectionName, options = {}) {
  let query = getCollection(collectionName);
  
  // 条件查询
  if (options.where) {
    query = query.where(options.where);
  }
  
  // 排序
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.order || 'desc');
  }
  
  // 限制数量
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  // 跳过
  if (options.skip) {
    query = query.skip(options.skip);
  }
  
  return query.get();
}

/**
 * 分页查询
 * @param {string} collectionName - 集合名称
 * @param {number} page - 页码（从 1 开始）
 * @param {number} pageSize - 每页数量
 * @param {Object} options - 其他查询选项
 * @returns {Promise}
 */
function queryWithPagination(collectionName, page = 1, pageSize = 20, options = {}) {
  const skip = (page - 1) * pageSize;
  
  return queryDocuments(collectionName, {
    ...options,
    limit: pageSize,
    skip: skip,
  });
}

/**
 * 统计文档数量
 * @param {string} collectionName - 集合名称
 * @param {Object} where - 查询条件
 * @returns {Promise<number>}
 */
function countDocuments(collectionName, where = {}) {
  return getCollection(collectionName)
    .where(where)
    .count()
    .then(res => res.total || 0);
}

/**
 * 地理位置查询（附近）
 * @param {string} collectionName - 集合名称
 * @param {Object} location - 位置 {latitude, longitude}
 * @param {number} maxDistance - 最大距离（米）
 * @param {Object} options - 其他查询选项
 * @returns {Promise}
 */
function queryNearby(collectionName, location, maxDistance = 5000, options = {}) {
  const db = getDB();
  const _ = db.command;
  const center = new db.Geo.Point(location.longitude, location.latitude);
  
  return queryDocuments(collectionName, {
    ...options,
    where: {
      location: _.geoNear({
        geometry: center,
        maxDistance: maxDistance,
        minDistance: 0,
      })
    }
  });
}

/**
 * 保存用户信息
 * @param {Object} userInfo - 用户信息
 * @returns {Promise}
 */
async function saveUserInfo(userInfo) {
  const openid = app.globalData.openid;
  if (!openid) {
    throw new Error('未登录');
  }
  
  const db = getDB();
  const _ = db.command;
  
  // 查询是否已存在
  const res = await getCollection('users')
    .where({ _openid: openid })
    .get();
  
  if (res.data && res.data.length > 0) {
    // 更新
    return updateDocument('users', res.data[0]._id, {
      userInfo: userInfo,
    });
  } else {
    // 新增
    return addDocument('users', {
      userInfo: userInfo,
    });
  }
}

/**
 * 获取用户信息
 * @param {string} openid - 用户 openid（可选，默认当前用户）
 * @returns {Promise}
 */
async function getUserInfo(openid = null) {
  const targetOpenid = openid || app.globalData.openid;
  if (!targetOpenid) {
    throw new Error('未登录');
  }
  
  const res = await getCollection('users')
    .where({ _openid: targetOpenid })
    .get();
  
  if (res.data && res.data.length > 0) {
    return res.data[0];
  }
  
  return null;
}

/**
 * 保存障碍点问题
 * @param {Object} issueData - 问题数据
 * @returns {Promise}
 */
function saveIssue(issueData) {
  return addDocument('issues', issueData);
}

/**
 * 保存改造方案
 * @param {Object} solutionData - 方案数据
 * @returns {Promise}
 */
function saveSolution(solutionData) {
  return addDocument('solutions', solutionData);
}

/**
 * 保存社区帖子
 * @param {Object} postData - 帖子数据
 * @returns {Promise}
 */
function savePost(postData) {
  return addDocument('posts', postData);
}

/**
 * 保存评论
 * @param {Object} commentData - 评论数据
 * @returns {Promise}
 */
function saveComment(commentData) {
  return addDocument('comments', commentData);
}

/**
 * 点赞/取消点赞
 * @param {string} targetType - 目标类型（post/solution/comment）
 * @param {string} targetId - 目标 ID
 * @returns {Promise}
 */
async function toggleLike(targetType, targetId) {
  return app.callFunction('toggleInteraction', {
    type: 'like',
    targetType: targetType,
    targetId: targetId,
  });
}

/**
 * 收藏/取消收藏
 * @param {string} targetType - 目标类型（post/solution）
 * @param {string} targetId - 目标 ID
 * @returns {Promise}
 */
async function toggleCollect(targetType, targetId) {
  return app.callFunction('toggleInteraction', {
    type: 'collect',
    targetType: targetType,
    targetId: targetId,
  });
}

/**
 * 关注/取消关注
 * @param {string} targetId - 目标用户 openid
 * @returns {Promise}
 */
async function toggleFollow(targetId) {
  return app.callFunction('toggleInteraction', {
    type: 'follow',
    targetId: targetId,
  });
}

module.exports = {
  getDB,
  getCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  queryWithPagination,
  countDocuments,
  queryNearby,
  saveUserInfo,
  getUserInfo,
  saveIssue,
  saveSolution,
  savePost,
  saveComment,
  toggleLike,
  toggleCollect,
  toggleFollow,
};









