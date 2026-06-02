const cloud = require('wx-server-sdk');
const { normalizeClassificationInput } = require('./issueClassification');
const { matchIssueSchemes } = require('./schemeMatcher');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  try {
    const recognition = normalizeClassificationInput(event);
    if (!recognition) {
      return fail('识别结果无效');
    }

    const match = await matchIssueSchemes(db, recognition);
    return {
      success: true,
      ...match
    };
  } catch (err) {
    console.error('[matchIssueSchemes] failed:', err && err.message ? err.message : err);
    return fail('方案匹配失败');
  }
};

function fail(message) {
  return {
    success: false,
    error: message,
    hasScheme: false,
    schemeMessage: message,
    schemeSource: 'scheme_library',
    matchedSchemes: []
  };
}
