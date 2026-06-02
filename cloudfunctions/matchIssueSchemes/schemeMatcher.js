const SCHEME_COLLECTION = 'scheme_library';
const MAX_SCHEME_RESULTS = 3;

const SCHEME_MATCH_RULES = {
  '入户门': {
    '门槛太高': ['A-1.1', 'A-1.2', 'C-1.1'],
    '门太窄': ['A-3.1', 'A-3.2', 'C-3.1'],
    '把手太高或难拧': ['A-2.1', 'A-2.2', 'C-2'],
    '开门太费力': ['A-2.2', 'A-2.3', 'C-2'],
    '门前空间不足': ['A-2.2', 'A-2.3', 'C-4']
  },
  '坡道': {
    '坡道衔接平台有坎': ['D-1', 'E-1.1'],
    '坡道太陡': ['D-2.2', 'D-3.1', 'E-2.1'],
    '坡道太窄': ['D-2.1', 'D-3.1', 'E-2.1'],
    '无扶手或高度不对': ['D-2.1', 'D-2.2', 'D-3.2'],
    '坡面太滑': ['E-2.1', 'D-3.1', 'D-3.2'],
    '坡道破损或头尾无平台': ['D-3.1', 'D-3.2', 'D-2.3']
  },
  '台阶': {
    '第一级太高': ['F-1', 'F-3', 'G-1'],
    '台阶面太滑': ['F-2', 'F-5', 'G-3'],
    '扶手缺失或不适': ['F-3', 'F-4', 'G-2.1'],
    '台阶破损': ['F-1', 'F-4', 'G-1']
  }
};

const PREVIEW_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const ENGINEERING_EXTS = new Set(['dwg', 'skp', 'skb', '3dm', 'bak', 'zip', 'rar']);

async function matchIssueSchemes(db, recognition = {}) {
  const category = toText(recognition.recognizedCategory || recognition.categoryName, 32);
  const subtypes = normalizeSubtypeInputs(recognition);
  const schemeCodes = getMatchedSchemeCodes(category, subtypes);

  if (!schemeCodes.length) {
    return emptyMatch('暂无匹配方案');
  }

  const _ = db.command;
  let docs = [];
  try {
    const res = await db.collection(SCHEME_COLLECTION)
      .where({ schemeCode: _.in(schemeCodes) })
      .field({
        schemeCode: true,
        code: true,
        title: true,
        facilityGroups: true,
        matchedCategories: true,
        matchedSubtypes: true,
        schemePrefix: true,
        sortOrder: true,
        files: true,
        fileGroups: true,
        schemeSummary: true,
        displaySections: true,
        previewFiles: true,
        packageFiles: true,
        totalFileCount: true,
        previewFileCount: true,
        engineeringFileCount: true,
        resourceStatus: true,
        disabled: true
      })
      .limit(MAX_SCHEME_RESULTS)
      .get();
    docs = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('[schemeMatcher] scheme_library query failed:', err && err.message ? err.message : err);
    return emptyMatch('暂无匹配方案');
  }

  const docMap = {};
  docs.forEach((doc) => {
    if (!doc || doc.disabled === true) return;
    const code = toText(doc.schemeCode || doc.code, 32);
    if (code) docMap[code] = doc;
  });

  const matchedSchemes = schemeCodes
    .map((code) => sanitizeScheme(docMap[code]))
    .filter((scheme) => scheme && scheme.code)
    .slice(0, MAX_SCHEME_RESULTS);

  return {
    hasScheme: matchedSchemes.length > 0,
    schemeMessage: matchedSchemes.length > 0 ? '' : '暂无匹配方案',
    schemeSource: 'scheme_library',
    matchedSchemes
  };
}

function getMatchedSchemeCodes(category, subtypes) {
  const rules = SCHEME_MATCH_RULES[category];
  if (!rules) return [];
  const codes = [];
  const seen = new Set();
  (Array.isArray(subtypes) ? subtypes : []).forEach((subtype) => {
    const matched = Array.isArray(rules[subtype]) ? rules[subtype] : [];
    matched.forEach((code) => {
      if (!code || seen.has(code) || codes.length >= MAX_SCHEME_RESULTS) return;
      seen.add(code);
      codes.push(code);
    });
  });
  return codes;
}

function normalizeSubtypeInputs(recognition) {
  const source = Array.isArray(recognition.recognizedSubtypes)
    ? recognition.recognizedSubtypes
    : [];
  const fallback = toText(recognition.recognizedSubtype || recognition.subtype, 64);
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

function sanitizeScheme(doc) {
  if (!doc) return null;
  const code = toText(doc.schemeCode || doc.code, 32);
  if (!code) return null;

  const files = normalizeFiles(doc.files);
  const previewFiles = normalizeFiles(doc.previewFiles)
    .filter((file) => file.previewable);
  const packageFiles = normalizeFiles(doc.packageFiles);
  const fileGroups = normalizeFileGroups(doc.fileGroups, files);
  const totalFileCount = Number(doc.totalFileCount) || files.length || countGroupFiles(fileGroups);

  return {
    code,
    schemeCode: code,
    title: toText(doc.title, 80) || `${code}改造方案`,
    resourceStatus: totalFileCount > 0 ? 'ready' : 'placeholder',
    files,
    fileGroups,
    schemeSummary: normalizeSchemeSummary(doc.schemeSummary, code, doc.title, doc.matchedCategories, doc.matchedSubtypes),
    displaySections: normalizeDisplaySections(doc.displaySections, fileGroups, files, doc.schemeSummary, code, doc.title, doc.matchedCategories, doc.matchedSubtypes),
    previewFiles,
    packageFiles,
    totalFileCount,
    previewFileCount: Number(doc.previewFileCount) || previewFiles.length,
    engineeringFileCount: Number(doc.engineeringFileCount) || packageFiles.length
  };
}

function normalizeFileGroups(value, fallbackFiles) {
  if (Array.isArray(value) && value.length) {
    return value.map((group) => ({
      groupName: toText(group && (group.groupName || group.title), 80) || '方案文件',
      title: toText(group && (group.title || group.groupName), 80) || '方案文件',
      files: normalizeFiles(group && group.files)
    })).filter((group) => group.files.length > 0);
  }

  const groups = {};
  normalizeFiles(fallbackFiles).forEach((file) => {
    const groupName = toText(file.groupName, 80) || '方案文件';
    if (!groups[groupName]) {
      groups[groupName] = { groupName, title: groupName, files: [] };
    }
    groups[groupName].files.push(file);
  });

  return Object.keys(groups).map((key) => groups[key]);
}

function normalizeDisplaySections(value, fileGroups, files, summary, code, title, categories, subtypes) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    drawingFiles: normalizeFiles(source.drawingFiles).length
      ? normalizeFiles(source.drawingFiles)
      : pickFiles(fileGroups, files, isDrawingFile),
    tagCardFiles: normalizeFiles(source.tagCardFiles).length
      ? normalizeFiles(source.tagCardFiles)
      : pickFiles(fileGroups, files, (file) => toText(file.name, 120).indexOf('方案标签卡') > -1),
    materialTableFiles: normalizeFiles(source.materialTableFiles).length
      ? normalizeFiles(source.materialTableFiles)
      : pickFiles(fileGroups, files, isMaterialTableFile),
    constructionFiles: normalizeFiles(source.constructionFiles).length
      ? normalizeFiles(source.constructionFiles)
      : pickFiles(fileGroups, files, (file) => /施工工艺|验收标准/.test(toText(file.name, 120))),
    tagSummary: normalizeSchemeSummary(source.tagSummary || summary, code, title, categories, subtypes)
  };
}

function normalizeSchemeSummary(value, code, title, categories, subtypes) {
  const source = value && typeof value === 'object' ? value : {};
  const matchedSubtypes = normalizeTextList(source.matchedSubtypes).length
    ? normalizeTextList(source.matchedSubtypes)
    : normalizeTextList(subtypes);
  return {
    category: toText(source.category, 32) || normalizeTextList(categories)[0] || '',
    facility: toText(source.facility, 32),
    matchedSubtypes,
    designFocus: toText(source.designFocus, 180) || toText(title, 120) || code,
    evidence: toText(source.evidence, 180) || (matchedSubtypes.length ? `适用于：${matchedSubtypes.join('、')}` : '')
  };
}

function pickFiles(fileGroups, files, predicate) {
  const fromGroups = [];
  (Array.isArray(fileGroups) ? fileGroups : []).forEach((group) => {
    (Array.isArray(group.files) ? group.files : []).forEach((file) => {
      if (predicate(file)) fromGroups.push(file);
    });
  });
  const picked = fromGroups.length ? fromGroups : normalizeFiles(files).filter(predicate);
  return picked.sort(sortDisplayFile);
}

function isDrawingFile(file) {
  const name = toText(file && file.name, 120);
  const groupName = toText(file && file.groupName, 80);
  const ext = toText(file && file.ext, 12);
  if (groupName.indexOf('施工图纸') > -1) return true;
  return /平面图|立面图|节点|详图|图纸/.test(name) && (ext === 'pdf' || ext === 'dwg');
}

function isMaterialTableFile(file) {
  const name = toText(file && file.name, 120);
  return (name.indexOf('材料清单') > -1 || name.indexOf('物料清单') > -1) && toText(file && file.ext, 12) === 'xlsx';
}

function sortDisplayFile(a, b) {
  const previewScore = Number(b.previewable === true) - Number(a.previewable === true);
  if (previewScore) return previewScore;
  return toText(a && a.schemeRelativePath, 512).localeCompare(toText(b && b.schemeRelativePath, 512));
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item, 64)).filter(Boolean);
}

function normalizeFiles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeFile)
    .filter((file) => file && (file.fileID || file.url || file.src || file.cloudPath));
}

function normalizeFile(file) {
  if (typeof file === 'string') {
    const ext = getExt(file);
    return {
      name: getName(file),
      fileID: file,
      ext,
      fileType: getFileType(ext),
      previewable: PREVIEW_EXTS.has(ext)
    };
  }
  if (!file || typeof file !== 'object') return null;
  const fileID = toText(file.fileID || file.fileId, 512);
  const url = toText(file.url, 1024);
  const src = toText(file.src, 1024);
  const cloudPath = toText(file.cloudPath, 512);
  const name = toText(file.name, 120) || getName(fileID || url || src || cloudPath);
  const ext = getExt(name || fileID || url || src || cloudPath);
  const fileType = toText(file.fileType, 32) || getFileType(ext);
  return {
    name,
    fileID,
    url,
    src,
    cloudPath,
    relativePath: toText(file.relativePath, 512),
    schemeRelativePath: toText(file.schemeRelativePath, 512),
    groupName: toText(file.groupName, 80),
    ext,
    fileType,
    previewable: file.previewable === true || PREVIEW_EXTS.has(ext)
  };
}

function countGroupFiles(fileGroups) {
  return (fileGroups || []).reduce((sum, group) => {
    return sum + (Array.isArray(group.files) ? group.files.length : 0);
  }, 0);
}

function getFileType(ext) {
  if (PREVIEW_EXTS.has(ext)) return 'preview';
  if (ENGINEERING_EXTS.has(ext)) return 'engineering';
  return ext || 'file';
}

function getName(value) {
  const text = String(value || '').split('?')[0].replace(/\\/g, '/');
  return text.split('/').pop() || '';
}

function getExt(value) {
  const name = getName(value);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function toText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function emptyMatch(message) {
  return {
    hasScheme: false,
    schemeMessage: message,
    schemeSource: 'scheme_library',
    matchedSchemes: []
  };
}

module.exports = {
  SCHEME_MATCH_RULES,
  matchIssueSchemes
};
