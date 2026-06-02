const https = require('https');
const { URL } = require('url');

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen3.6-plus';
const REQUEST_TIMEOUT_MS = 30000;

async function generateDiagnosisWithAI(input = {}) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY not configured' };
  }

  const imageUrl = await resolveImageUrl(input.cloud, input.imageFileID);
  const messages = buildMessages(input, imageUrl);
  const payload = {
    model: process.env.DASHSCOPE_REPORT_MODEL || process.env.DASHSCOPE_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    messages
  };

  const response = await postJson(API_URL, payload, {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  });
  const text = response &&
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content;

  const normalized = normalizeReportText(text);
  if (!normalized) {
    return { success: false, error: 'empty AI diagnosis response' };
  }
  return { success: true, text: normalized };
}

async function resolveImageUrl(cloud, fileID) {
  const safeFileID = toText(fileID, 1024);
  if (!cloud || !safeFileID || safeFileID.indexOf('cloud://') !== 0) return '';
  try {
    const res = await cloud.getTempFileURL({ fileList: [safeFileID] });
    const item = res.fileList && res.fileList[0];
    return item && item.tempFileURL ? item.tempFileURL : '';
  } catch (err) {
    console.warn('[aiDiagnosisGenerator] getTempFileURL failed:', err && err.message ? err.message : err);
    return '';
  }
}

function buildMessages(input, imageUrl) {
  const textPrompt = buildUserPrompt(input);
  const userContent = [{ type: 'text', text: textPrompt }];
  if (imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });
  }

  return [
    {
      role: 'system',
      content: [
        '你是无障碍设施整改方案生成助手。',
        '你只能基于用户问题、AI识别结果、现场图片和系统已匹配的方案库内容生成报告。',
        '不要重新选择方案编号，不要输出未提供的方案编号。',
        '没有实测数据时，不能编造具体毫米、坡度或尺寸，只能写“需现场复核”或“照片显示”。',
        '输出必须是中文纯文本，不要 Markdown，不要 JSON，不要额外解释。',
        '必须严格包含以下栏目：',
        '【无障碍设施AI诊断报告】、诊断时间、设施类型、检测方式、合规性结论、关键问题清单、整改建议、适配整改方案、备注。'
      ].join('\n')
    },
    {
      role: 'user',
      content: userContent
    }
  ];
}

function buildUserPrompt(input) {
  const recognition = input.recognition || {};
  const recognizedSubtypes = normalizeRecognizedSubtypes(recognition);
  const schemes = summarizeSchemes(input.matchedSchemes);
  return [
    '请根据以下信息生成诊断报告，格式必须完全贴近给定模板。',
    '',
    '【报告模板】',
    '【无障碍设施AI诊断报告】',
    '诊断时间：{YYYY-MM-DD HH:MM}',
    '设施类型：{AI识别结果/用户选择}',
    '检测方式：AI图像识别 + 用户补充核验',
    '',
    '▌合规性结论：{合规/部分不合规/不合规}',
    '',
    '▌关键问题清单（按严重程度排序）',
    '1. 问题点：{问题名称}',
    '   位置：{AI标注位置/用户描述}',
    '   描述：{问题具体表现}',
    '   对应规范：《无障碍设计规范》GB 50763-2012 第X.X.X条',
    '   规范要求：{标准要求}',
    '   现状偏差：{实测值/现象；无实测值则写需现场复核}',
    '   风险等级：{高/中/低}',
    '',
    '▌整改建议',
    '1. 优先整改项：',
    '   - {高风险可执行措施}',
    '2. 优化提升项：',
    '   - {中低风险建议}',
    '',
    '▌适配整改方案（系统推荐）',
    '方案编号：{只能使用系统匹配方案编号}',
    '适用场景：{设施类型+问题类型}',
    '核心措施：{结合方案库标签卡、施工图、物料表总结}',
    '预估影响：{可解决的问题、适用人群}',
    '',
    '▌备注',
    '- 本诊断结果基于现场照片与用户提供信息生成，仅供社区自查与整改参考。',
    '- 涉及结构安全或重大改造的，建议由专业机构现场勘查后实施。',
    '',
    '【输入信息】',
    `诊断时间：${formatDateTime(new Date())}`,
    `识别大类：${toText(recognition.recognizedCategory, 32)}`,
    `识别子类：${recognizedSubtypes.join('、') || toText(recognition.recognizedSubtype, 64)}`,
    `识别置信度：${formatConfidence(recognition.recognitionConfidence)}`,
    `用户描述：${toText(input.content, 500) || '未填写'}`,
    `位置：${buildLocationText(input)}`,
    '',
    '【系统匹配方案库】',
    schemes.length ? schemes.join('\n\n') : '暂无匹配方案。请在适配整改方案中明确写“暂无匹配方案”。',
    '',
    '请只输出最终报告正文。'
  ].join('\n');
}

function normalizeRecognizedSubtypes(recognition) {
  const source = Array.isArray(recognition && recognition.recognizedSubtypes)
    ? recognition.recognizedSubtypes
    : [];
  const fallback = toText(recognition && recognition.recognizedSubtype, 64);
  const seen = new Set();
  const result = [];
  source.concat(fallback ? [fallback] : []).forEach((item) => {
    const subtype = toText(item, 64);
    if (!subtype || seen.has(subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });
  return result;
}

function summarizeSchemes(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((scheme) => {
    const code = toText(scheme && (scheme.code || scheme.schemeCode), 32);
    const title = toText(scheme && scheme.title, 100);
    const summary = scheme && scheme.schemeSummary ? scheme.schemeSummary : {};
    const sections = scheme && scheme.displaySections ? scheme.displaySections : {};
    return [
      `方案编号：${code}`,
      `方案名称：${title}`,
      `方案简化标签卡：${toText(summary.designFocus, 240) || title}`,
      `适用问题：${Array.isArray(summary.matchedSubtypes) ? summary.matchedSubtypes.join('、') : ''}`,
      `施工图纸：${summarizeFiles(sections.drawingFiles)}`,
      `施工物料表：${summarizeFiles(sections.materialTableFiles)}`,
      `补充工艺文件：${summarizeFiles(sections.constructionFiles)}`
    ].join('\n');
  }).filter((item) => item.indexOf('方案编号：') > -1);
}

function summarizeFiles(files) {
  if (!Array.isArray(files) || !files.length) return '暂无';
  return files
    .slice(0, 6)
    .map((file) => toText(file && file.name, 120))
    .filter(Boolean)
    .join('、') || '暂无';
}

function buildLocationText(input) {
  const detail = toText(input.detailAddress, 120);
  const formatted = toText(input.formattedAddress, 120);
  const address = toText(input.address, 120);
  const coordinate = buildCoordinateText(input.location);
  const place = detail || formatted || address || '现场照片主体区域';
  return coordinate ? `${place}（${coordinate}）` : place;
}

function buildCoordinateText(location) {
  if (!location || typeof location !== 'object') return '';
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `经度 ${longitude.toFixed(6)}，纬度 ${latitude.toFixed(6)}`;
}

function formatConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '未知';
  return `${Math.round(number * 100)}%`;
}

function normalizeReportText(value) {
  const text = toText(String(value || ''), 6000)
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!text || text.indexOf('【无障碍设施AI诊断报告】') === -1) return '';
  return text;
}

function postJson(url, data, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request({
      method: 'POST',
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: Object.assign({}, headers, {
        'Content-Length': Buffer.byteLength(body)
      }),
      timeout: REQUEST_TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch (err) {
          return reject(new Error(`DashScope invalid response: ${raw.slice(0, 200)}`));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`DashScope request failed ${res.statusCode}: ${raw.slice(0, 500)}`));
        }
        resolve(json);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('DashScope request timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function formatDateTime(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = chinaTime.getUTCFullYear();
  const m = pad2(chinaTime.getUTCMonth() + 1);
  const d = pad2(chinaTime.getUTCDate());
  const h = pad2(chinaTime.getUTCHours());
  const min = pad2(chinaTime.getUTCMinutes());
  return `${y}-${m}-${d} ${h}:${min}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

module.exports = {
  generateDiagnosisWithAI
};
