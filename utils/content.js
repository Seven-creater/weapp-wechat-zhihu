// 無界营造 - 内容审核模块
// utils/content.js

const app = getApp();

/**
 * 文本内容安全检测
 * @param {string} text - 文本内容
 * @returns {Promise<boolean>}
 */
function checkTextSafe(text) {
  if (!text || !text.trim()) {
    return Promise.resolve(true);
  }
  
  return app.callFunction('checkContent', {
    type: 'text',
    value: text.trim(),
  })
  .then(res => {
    if (res.code === 0) {
      return true;
    } else {
      throw new Error('内容包含敏感信息');
    }
  });
}

/**
 * 图片内容安全检测
 * @param {string} fileID - 云存储文件 ID
 * @returns {Promise<boolean>}
 */
function checkImageSafe(fileID) {
  if (!fileID) {
    return Promise.resolve(true);
  }
  
  return app.callFunction('checkContent', {
    type: 'image',
    value: fileID,
  })
  .then(res => {
    if (res.code === 0) {
      return true;
    } else {
      throw new Error('图片包含敏感内容');
    }
  });
}

/**
 * 批量检测文本
 * @param {Array<string>} texts - 文本数组
 * @returns {Promise<boolean>}
 */
async function checkMultipleTexts(texts) {
  for (let text of texts) {
    await checkTextSafe(text);
  }
  return true;
}

/**
 * 批量检测图片
 * @param {Array<string>} fileIDs - 文件 ID 数组
 * @returns {Promise<boolean>}
 */
async function checkMultipleImages(fileIDs) {
  for (let fileID of fileIDs) {
    await checkImageSafe(fileID);
  }
  return true;
}

/**
 * 检测帖子内容
 * @param {Object} postData - 帖子数据
 * @returns {Promise<boolean>}
 */
async function checkPostContent(postData) {
  const texts = [];
  
  if (postData.title) texts.push(postData.title);
  if (postData.content) texts.push(postData.content);
  
  await checkMultipleTexts(texts);
  
  if (postData.images && postData.images.length > 0) {
    await checkMultipleImages(postData.images);
  }
  
  return true;
}

/**
 * 检测评论内容
 * @param {string} content - 评论内容
 * @returns {Promise<boolean>}
 */
function checkCommentContent(content) {
  return checkTextSafe(content);
}

/**
 * 过滤敏感词（简单实现）
 * @param {string} text - 文本
 * @returns {string}
 */
function filterSensitiveWords(text) {
  if (!text) return '';
  
  // 这里应该从服务端获取敏感词库
  const sensitiveWords = ['敏感词1', '敏感词2']; // 示例
  
  let filtered = text;
  sensitiveWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '***');
  });
  
  return filtered;
}

/**
 * 举报内容
 * @param {Object} reportData - 举报数据
 * @returns {Promise}
 */
function reportContent(reportData) {
  return app.callFunction('reportContent', reportData);
}

module.exports = {
  checkTextSafe,
  checkImageSafe,
  checkMultipleTexts,
  checkMultipleImages,
  checkPostContent,
  checkCommentContent,
  filterSensitiveWords,
  reportContent,
};









