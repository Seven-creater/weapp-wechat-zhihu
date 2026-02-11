// cloudfunctions/getDesignProposal/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 查询问题帖关联的设计方案
 */
exports.main = async (event, context) => {
  const { issueId } = event;

  try {
    if (!issueId) {
      return {
        success: false,
        error: '缺少问题ID'
      };
    }

    // 查询关联的设计方案
    const result = await db.collection('design_proposals')
      .where({
        issueId: issueId
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      return {
        success: true,
        data: result.data[0]
      };
    } else {
      return {
        success: false,
        error: '未找到设计方案'
      };
    }

  } catch (err) {
    console.error('查询设计方案失败:', err);
    return {
      success: false,
      error: err.message || '查询失败'
    };
  }
};


