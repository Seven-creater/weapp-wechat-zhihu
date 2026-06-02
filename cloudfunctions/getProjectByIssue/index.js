// cloudfunctions/getProjectByIssue/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const media = require('./media');

/**
 * 查询问题帖关联的施工项目
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

    // 查询关联的施工项目
    const result = await db.collection('construction_projects')
      .where({
        issueId: issueId
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      const data = await replaceMedia(result.data[0]);
      return {
        success: true,
        data
      };
    } else {
      return {
        success: false,
        error: '未找到施工项目'
      };
    }

  } catch (err) {
    console.error('查询施工项目失败:', err);
    return {
      success: false,
      error: err.message || '查询失败'
    };
  }
};

async function replaceMedia(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const cloudIds = media.collectCloudFileIdsDeep(doc, new Set(), { maxScan: 160 });
  const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getProjectByIssue'
  });
  return media.replaceCloudUrlsDeep(doc, urlMap, { maxDepth: 6 });
}


