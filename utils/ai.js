// 無界营造 - AI 诊断服务模块
// utils/ai.js

const app = getApp();
const { showLoading, hideLoading, showError } = require('./common.js');

/**
 * 上传图片到云存储
 * @param {string} filePath - 本地文件路径
 * @param {string} prefix - 云存储路径前缀
 * @returns {Promise<string>} - 返回文件 ID
 */
function uploadImageForAI(filePath, prefix = 'ai-analysis') {
  const ext = filePath.split('.').pop() || 'jpg';
  const cloudPath = `${prefix}/${Date.now()}.${ext}`;
  
  return app.uploadFile(filePath, cloudPath);
}

/**
 * 调用 AI 诊断云函数
 * @param {string} fileID - 云存储文件 ID
 * @param {Object} location - 位置信息
 * @returns {Promise<Object>}
 */
function analyzeIssue(fileID, location = null) {
  return new Promise((resolve, reject) => {
    showLoading('AI 分析中...');
    
    app.callFunction('analyzeIssue', {
      fileID: fileID,
      location: location,
    })
    .then(res => {
      hideLoading();
      
      if (res.aiSolution || res.aiAnalysis) {
        resolve({
          solution: res.aiSolution || res.aiAnalysis,
          category: res.category || '',
          severity: res.severity || 'medium',
          suggestions: res.suggestions || [],
        });
      } else {
        throw new Error('AI 未返回分析结果');
      }
    })
    .catch(err => {
      hideLoading();
      console.error('AI 诊断失败:', err);
      showError('AI 诊断失败，请重试');
      reject(err);
    });
  });
}

/**
 * 批量分析图片
 * @param {Array<string>} filePaths - 本地文件路径数组
 * @param {Object} location - 位置信息
 * @returns {Promise<Array<Object>>}
 */
async function analyzeMultipleImages(filePaths, location = null) {
  const results = [];
  
  for (let i = 0; i < filePaths.length; i++) {
    try {
      showLoading(`分析中 ${i + 1}/${filePaths.length}...`);
      
      const fileID = await uploadImageForAI(filePaths[i]);
      const result = await analyzeIssue(fileID, location);
      
      results.push({
        filePath: filePaths[i],
        fileID: fileID,
        analysis: result,
      });
    } catch (err) {
      console.error(`分析第 ${i + 1} 张图片失败:`, err);
      results.push({
        filePath: filePaths[i],
        error: err.message,
      });
    }
  }
  
  hideLoading();
  return results;
}

/**
 * 生成改造方案
 * @param {Object} diagnosis - 诊断结果
 * @param {Object} userInput - 用户输入
 * @returns {Promise<Object>}
 */
function generateSolution(diagnosis, userInput = {}) {
  return new Promise((resolve, reject) => {
    showLoading('生成方案中...');
    
    app.callFunction('generateSolution', {
      diagnosis: diagnosis,
      userInput: userInput,
    })
    .then(res => {
      hideLoading();
      resolve({
        title: res.title || '改造方案',
        description: res.description || '',
        steps: res.steps || [],
        materials: res.materials || [],
        estimatedCost: res.estimatedCost || 0,
        estimatedTime: res.estimatedTime || '',
      });
    })
    .catch(err => {
      hideLoading();
      console.error('生成方案失败:', err);
      showError('生成方案失败');
      reject(err);
    });
  });
}

/**
 * 估算改造成本
 * @param {Object} solution - 改造方案
 * @returns {Promise<Object>}
 */
function estimateCost(solution) {
  return new Promise((resolve, reject) => {
    app.callFunction('estimateCost', {
      solution: solution,
    })
    .then(res => {
      resolve({
        totalCost: res.totalCost || 0,
        breakdown: res.breakdown || [],
        materials: res.materials || [],
        labor: res.labor || 0,
      });
    })
    .catch(err => {
      console.error('估算成本失败:', err);
      reject(err);
    });
  });
}

/**
 * 智能推荐施工团队
 * @param {Object} solution - 改造方案
 * @param {Object} location - 位置信息
 * @returns {Promise<Array>}
 */
function recommendTeams(solution, location) {
  return new Promise((resolve, reject) => {
    app.callFunction('recommendTeams', {
      solution: solution,
      location: location,
    })
    .then(res => {
      resolve(res.teams || []);
    })
    .catch(err => {
      console.error('推荐团队失败:', err);
      reject(err);
    });
  });
}

module.exports = {
  uploadImageForAI,
  analyzeIssue,
  analyzeMultipleImages,
  generateSolution,
  estimateCost,
  recommendTeams,
};









