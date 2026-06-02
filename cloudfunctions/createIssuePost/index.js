const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const { matchIssueSchemes } = require('./schemeMatcher');
const { buildDiagnosisReport } = require('./diagnosisReport');
const { generateDiagnosisWithAI } = require('./aiDiagnosisGenerator');
const {
  ISSUE_CLASSIFICATION_SCHEMA,
  getCategoryId,
  normalizeClassificationInput
} = require('./issueClassification');

const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const PHONE_REG = /^1[3-9]\d{9}$/;
const MAX_CONTENT_LEN = 500;
const MAX_TITLE_LEN = 30;
const MAX_AI_SOLUTION_LEN = 1000;
const MAX_AI_DIAGNOSIS_LEN = 3000;
const MAX_DETAIL_ADDRESS_LEN = 120;
const MAX_ADDRESS_LEN = 120;
const MAX_IMAGES = 9;

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const userContent = toText(event.content, MAX_CONTENT_LEN);

    const community = toText(event.community, 32);
    if (!ALLOWED_COMMUNITIES.has(community)) {
      return fail('社区参数无效');
    }

    const recognition = normalizeClassificationInput(event);
    if (!recognition) {
      return fail('请先完成图片识别');
    }
    const categoryName = recognition.recognizedCategory;
    const categoryId = getCategoryId(categoryName);
    const subtypeText = recognition.recognizedSubtypes.join('、');
    const fallbackContent = `${categoryName} / ${subtypeText}`;
    const content = userContent || fallbackContent;
    const title = toText(event.title, MAX_TITLE_LEN) || userContent.slice(0, MAX_TITLE_LEN) || fallbackContent.slice(0, MAX_TITLE_LEN);

    const images = normalizeImageList(event.images);
    if (images.length === 0) {
      return fail('请至少上传一张图片');
    }

    const location = normalizeLocation(event.location);
    if (!location) {
      return fail('位置信息无效');
    }

    const contactPhone = toText(event.contactPhone, 32);
    if (contactPhone && !PHONE_REG.test(contactPhone)) {
      return fail('联系电话格式不正确');
    }

    const aiSolution = toText(event.aiSolution, MAX_AI_SOLUTION_LEN);
    const address = toText(event.address, MAX_ADDRESS_LEN);
    const formattedAddress = toText(event.formattedAddress, MAX_ADDRESS_LEN);
    const detailAddress = toText(event.detailAddress, MAX_DETAIL_ADDRESS_LEN);
    const schemeMatch = await matchIssueSchemes(db, recognition);
    const reportInput = {
      recognition,
      content: userContent,
      location,
      address,
      formattedAddress,
      detailAddress,
      matchedSchemes: schemeMatch.matchedSchemes
    };
    const aiResult = await generateDiagnosisSafely({
      ...reportInput,
      cloud,
      imageFileID: images[0]
    });
    const aiDiagnosis = toText(aiResult.text || buildDiagnosisReport(reportInput), MAX_AI_DIAGNOSIS_LEN);
    const rampProblems = categoryName === '坡道' ? recognition.recognizedSubtypes : [];

    const userResult = await db.collection('users')
      .where({ _openid: openid })
      .field({ userInfo: true, userType: true })
      .limit(1)
      .get();
    const userData = (userResult.data && userResult.data[0]) || {};
    const userInfo = userData.userInfo || {};

    const postData = {
      _openid: openid,
      type: 'issue',
      status: 'pending',
      title,
      content,
      images,
      category: categoryId,
      categoryId,
      categoryName,
      community,
      location: new db.Geo.Point(location.longitude, location.latitude),
      address,
      formattedAddress,
      detailAddress,
      aiSolution,
      aiDiagnosis,
      recognizedCategory: recognition.recognizedCategory,
      recognizedSubtype: recognition.recognizedSubtype,
      recognizedSubtypes: recognition.recognizedSubtypes,
      recognitionConfidence: recognition.recognitionConfidence,
      categoryProbabilities: normalizeProbabilities(event.categoryProbabilities, Object.keys(ISSUE_CLASSIFICATION_SCHEMA)),
      subcategoryProbabilities: normalizeProbabilities(event.subcategoryProbabilities, ISSUE_CLASSIFICATION_SCHEMA[recognition.recognizedCategory] || []),
      recognitionStatus: 'success',
      diagnosisMode: aiResult.mode,
      rampProblems,
      hasScheme: schemeMatch.hasScheme,
      schemeMessage: schemeMatch.schemeMessage,
      schemeSource: schemeMatch.schemeSource,
      matchedSchemes: schemeMatch.matchedSchemes,
      contactPhone,
      userInfo: {
        nickName: toText(userInfo.nickName, 50) || '微信用户',
        avatarUrl: toText(userInfo.avatarUrl, 512) || '/images/zhi.png'
      },
      userType: toText(userData.userType, 32) || 'resident',
      stats: {
        like: 0,
        comment: 0,
        collect: 0,
        view: 0
      },
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('posts').add({ data: postData });

    return {
      success: true,
      postId: result._id,
      community,
      recognizedCategory: recognition.recognizedCategory,
      recognizedSubtype: recognition.recognizedSubtype,
      recognizedSubtypes: recognition.recognizedSubtypes
    };
  } catch (err) {
    console.error('[createIssuePost] failed:', err && err.message ? err.message : err);
    return fail(err && err.message ? err.message : '发布失败');
  }
};

function toText(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function normalizeImageList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toText(item, 1024))
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
}

function normalizeLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

function normalizeProbabilities(value, allowedKeys) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  allowedKeys.forEach((key) => {
    const number = Number(value[key]);
    if (Number.isFinite(number)) {
      result[key] = Math.max(0, Math.min(1, number));
    }
  });
  return result;
}

async function generateDiagnosisSafely(input) {
  try {
    const result = await generateDiagnosisWithAI(input);
    if (result && result.success && result.text) {
      return {
        mode: 'ai',
        text: result.text
      };
    }
    return {
      mode: 'fallback',
      text: ''
    };
  } catch (err) {
    console.warn('[createIssuePost] AI diagnosis fallback:', err && err.message ? err.message : err);
    return {
      mode: 'fallback',
      text: ''
    };
  }
}

function fail(message) {
  return {
    success: false,
    error: message
  };
}
