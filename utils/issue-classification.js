const ISSUE_CLASSIFICATION_SCHEMA = {
  '台阶': ['第一级太高', '台阶面太滑', '扶手缺失或不适', '台阶破损'],
  '入户门': ['门槛太高', '门太窄', '把手太高或难拧', '开门太费力', '门前空间不足'],
  '电梯': ['电梯门太窄', '按钮太高', '无语音或盲文', '开关门太快'],
  '坡道': ['坡道太陡', '坡道太窄', '无扶手或高度不对', '坡面太滑', '坡道破损或头尾无平台', '坡道衔接平台有坎'],
  '雨水箅子': ['格栅孔太大', '箅子破损或缺失', '格栅方向不对'],
  '路障': ['间距太窄', '无醒目标识', '路障不稳', '挡住无障碍通道'],
  '盲道': ['盲道中断', '盲道被占用', '盲道破损', '颜色不明显', '起点或终点缺提示砖']
};

const ISSUE_CATEGORIES = Object.keys(ISSUE_CLASSIFICATION_SCHEMA);
const MAX_RECOGNIZED_SUBTYPES = 5;

const CATEGORY_ID_MAP = {
  '台阶': 'steps',
  '入户门': 'door',
  '电梯': 'elevator',
  '坡道': 'ramp',
  '雨水箅子': 'drain',
  '路障': 'barrier',
  '盲道': 'tactile'
};

function getCategoryId(category) {
  return CATEGORY_ID_MAP[category] || '';
}

function isValidCategory(category) {
  return ISSUE_CATEGORIES.indexOf(category) > -1;
}

function getSubtypes(category) {
  return ISSUE_CLASSIFICATION_SCHEMA[category] || [];
}

function isValidSubtype(category, subtype) {
  return getSubtypes(category).indexOf(subtype) > -1;
}

function normalizeSubtypeList(category, value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const candidates = source.concat(fallback ? [fallback] : []);
  const seen = new Set();
  const result = [];

  candidates.forEach((item) => {
    const subtype = typeof item === 'string' ? item.trim() : '';
    if (!subtype || seen.has(subtype) || !isValidSubtype(category, subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });

  return result.slice(0, MAX_RECOGNIZED_SUBTYPES);
}

function normalizeClassificationInput(value) {
  const category = typeof value.recognizedCategory === 'string'
    ? value.recognizedCategory.trim()
    : '';
  const fallbackSubtype = typeof value.recognizedSubtype === 'string'
    ? value.recognizedSubtype.trim()
    : '';
  const confidence = Number(value.recognitionConfidence ?? value.confidence);
  const subtypes = normalizeSubtypeList(category, value.recognizedSubtypes, fallbackSubtype);

  if (!isValidCategory(category) || subtypes.length === 0) {
    return null;
  }

  return {
    recognizedCategory: category,
    recognizedSubtype: subtypes[0],
    recognizedSubtypes: subtypes,
    recognitionConfidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0
  };
}

module.exports = {
  ISSUE_CLASSIFICATION_SCHEMA,
  ISSUE_CATEGORIES,
  getCategoryId,
  getSubtypes,
  isValidCategory,
  isValidSubtype,
  normalizeSubtypeList,
  normalizeClassificationInput
};
