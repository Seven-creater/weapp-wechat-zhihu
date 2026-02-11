// cloudfunctions/getDesignProposals/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { issueId } = event;

    if (!issueId) {
      return {
        success: false,
        error: '缺少问题ID'
      };
    }

    // 查询该问题的所有设计方案
    const result = await db.collection('design_proposals')
      .where({
        issueId: issueId
      })
      .orderBy('createTime', 'desc')
      .get();

    return {
      success: true,
      data: result.data
    };

  } catch (err) {
    console.error('查询设计方案失败:', err);
    return {
      success: false,
      error: err.message || '查询失败'
    };
  }
};


