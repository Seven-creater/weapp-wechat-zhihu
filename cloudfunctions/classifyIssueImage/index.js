const cloud = require('wx-server-sdk');
const axios = require('axios');
const {
  ISSUE_CLASSIFICATION_SCHEMA,
  ISSUE_CATEGORIES,
  getSubtypes
} = require('./issueClassification');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen3.6-plus';
const MIN_CATEGORY_CONFIDENCE = 0.45;
const MAX_INLINE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_RECOGNIZED_SUBTYPES = 3;
const SUBTYPE_CONFIDENCE_THRESHOLD = 0.35;

exports.main = async (event = {}) => {
  try {
    const fileID = toText(event.fileID, 1024);
    if (!fileID || fileID.indexOf('cloud://') !== 0) {
      return fail('缺少有效图片，请重新拍摄');
    }

    const imageInput = await getImageInput(fileID);
    const raw = await callVisionModel(imageInput);
    const result = normalizeClassification(raw);
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: {
        ...result.data,
        recognitionStatus: 'success'
      }
    };
  } catch (err) {
    console.error('[classifyIssueImage] failed:', err && err.message ? err.message : err);
    return fail(getUserErrorMessage(err), err && err.code);
  }
};

async function getImageInput(fileID) {
  try {
    return await getImageDataUrl(fileID);
  } catch (err) {
    console.warn('[classifyIssueImage] download image failed, fallback to temp url:', err && err.message ? err.message : err);
    return getImageUrl(fileID);
  }
}

async function getImageDataUrl(fileID) {
  const res = await cloud.downloadFile({ fileID });
  const buffer = Buffer.from(res.fileContent || []);
  if (!buffer.length) {
    throw new Error('empty image file');
  }
  if (buffer.length > MAX_INLINE_IMAGE_BYTES) {
    const err = new Error('image too large for inline request');
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }
  return `data:${inferMimeType(fileID, buffer)};base64,${buffer.toString('base64')}`;
}

async function getImageUrl(fileID) {
  const res = await cloud.getTempFileURL({ fileList: [fileID] });
  const item = res.fileList && res.fileList[0];
  if (!item || !item.tempFileURL) {
    throw new Error('failed to resolve image url');
  }
  return item.tempFileURL;
}

async function callVisionModel(imageInput) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    const err = new Error('DASHSCOPE_API_KEY not configured');
    err.code = 'CONFIG_MISSING';
    throw err;
  }

  let response;
  try {
    response = await axios.post(
      API_URL,
      {
        model: process.env.DASHSCOPE_MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张无障碍设施照片，只返回 JSON。'
              },
              {
                type: 'image_url',
                image_url: { url: imageInput }
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );
  } catch (err) {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    const detail = data ? JSON.stringify(data).slice(0, 500) : err.message;
    const wrapped = new Error(`DashScope request failed${status ? ` ${status}` : ''}: ${detail}`);
    wrapped.code = 'MODEL_REQUEST_FAILED';
    throw wrapped;
  }

  const content = response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content;
  if (!content) {
    throw new Error('empty model response');
  }
  return parseJson(content);
}

function inferMimeType(fileID, buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  const ext = String(fileID || '').split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function buildSystemPrompt() {
  return [
    '你是无障碍设施图片分类器。必须只在以下七个大类中预测一个：',
    ISSUE_CATEGORIES.join('、'),
    '每个大类只能使用以下子类：',
    JSON.stringify(ISSUE_CLASSIFICATION_SCHEMA),
    '返回严格 JSON，不要 Markdown，不要解释。',
    'JSON 字段必须包含 categoryProbabilities、subcategoryProbabilities、recognizedCategory、recognizedSubtype、recognizedSubtypes、confidence。',
    'categoryProbabilities 必须包含全部七个大类，数值为 0 到 1。',
    'subcategoryProbabilities 只包含 recognizedCategory 对应的子类，数值为 0 到 1。',
    'recognizedSubtypes 是数组，只能包含 recognizedCategory 对应子类中照片可见的 1 到 3 个问题。',
    'recognizedSubtype 必须等于 recognizedSubtypes 的第一个子类。',
    '如果主体不清晰，也必须给出最可能的大类，但降低 confidence。'
  ].join('\n');
}

function parseJson(content) {
  if (typeof content === 'object') return content;
  const text = String(content || '').trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw err;
  }
}

function normalizeClassification(raw) {
  const categoryProbabilities = normalizeDistribution(
    raw && raw.categoryProbabilities,
    ISSUE_CATEGORIES
  );
  const topCategory = pickTop(categoryProbabilities);
  if (!topCategory || topCategory.probability < MIN_CATEGORY_CONFIDENCE) {
    return fail('识别失败，请重新拍摄，并对准设施主体');
  }

  const subtypes = getSubtypes(topCategory.name);
  const subcategoryProbabilities = normalizeDistribution(
    raw && raw.subcategoryProbabilities,
    subtypes
  );
  const topSubtype = pickTop(subcategoryProbabilities);
  if (!topSubtype) {
    return fail('识别失败，请重新拍摄，并对准设施主体');
  }
  const recognizedSubtypes = buildRecognizedSubtypes(
    raw,
    subcategoryProbabilities,
    topSubtype,
    subtypes
  );

  return {
    success: true,
    data: {
      categoryProbabilities,
      subcategoryProbabilities,
      recognizedCategory: topCategory.name,
      recognizedSubtype: recognizedSubtypes[0],
      recognizedSubtypes,
      confidence: topCategory.probability,
      modelProvider: 'dashscope',
      modelName: process.env.DASHSCOPE_MODEL || DEFAULT_MODEL
    }
  };
}

function buildRecognizedSubtypes(raw, probabilities, topSubtype, allowed) {
  const allowedSet = new Set(allowed || []);
  const result = [];
  const addSubtype = (name) => {
    const subtype = toText(name, 64);
    if (!subtype || !allowedSet.has(subtype) || result.includes(subtype)) return;
    result.push(subtype);
  };

  addSubtype(topSubtype && topSubtype.name);

  if (Array.isArray(raw && raw.recognizedSubtypes)) {
    raw.recognizedSubtypes.forEach(addSubtype);
  }

  if (result.length === 1) {
    Object.keys(probabilities || {})
      .map((name) => ({ name, probability: Number(probabilities[name]) || 0 }))
      .filter((item) => item.probability >= SUBTYPE_CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.probability - a.probability)
      .forEach((item) => addSubtype(item.name));
  }

  return result.slice(0, MAX_RECOGNIZED_SUBTYPES);
}

function normalizeDistribution(input, allowed) {
  const raw = {};
  let sum = 0;
  allowed.forEach((name) => {
    const value = Number(input && input[name]);
    const safe = Number.isFinite(value) && value > 0 ? value : 0;
    raw[name] = safe;
    sum += safe;
  });

  if (sum <= 0) {
    return raw;
  }

  const normalized = {};
  allowed.forEach((name) => {
    normalized[name] = Math.round((raw[name] / sum) * 10000) / 10000;
  });
  return normalized;
}

function pickTop(distribution) {
  let top = null;
  Object.keys(distribution || {}).forEach((name) => {
    const probability = Number(distribution[name]);
    if (!Number.isFinite(probability)) return;
    if (!top || probability > top.probability) {
      top = { name, probability };
    }
  });
  if (!top || top.probability <= 0) return null;
  return top;
}

function toText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function getUserErrorMessage(err) {
  const code = err && err.code;
  if (code === 'CONFIG_MISSING') {
    return 'AI 服务未配置，请检查云函数环境变量';
  }
  if (code === 'IMAGE_TOO_LARGE') {
    return '图片过大，请重新拍摄或压缩后再试';
  }
  if (code === 'MODEL_REQUEST_FAILED') {
    return 'AI 识别服务调用失败，请稍后重试';
  }
  return '识别失败，请重新拍摄，并对准设施主体';
}

function fail(message, code) {
  return {
    success: false,
    error: message,
    errorCode: code || 'CLASSIFY_FAILED',
    recognitionStatus: 'failed'
  };
}
