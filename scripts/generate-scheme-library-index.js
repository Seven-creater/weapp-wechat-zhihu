#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_LIBRARY_DIR = 'C:\\Users\\29785\\Desktop\\无障碍改造方案库';
const DEFAULT_OUT = path.join('tmp', 'scheme-library-index.json');
const DEFAULT_CLOUD_PREFIX = 'scheme-library';

const PREFIX_META = {
  A: { categories: ['入户门'], facilityGroups: ['单元门', '入户门'] },
  C: { categories: ['入户门'], facilityGroups: ['住宅门', '入户门'] },
  D: { categories: ['坡道'], facilityGroups: ['轮椅坡道', '坡道'] },
  E: { categories: ['坡道'], facilityGroups: ['缘石坡道', '坡道'] },
  F: { categories: ['台阶'], facilityGroups: ['台阶'] },
  G: { categories: ['台阶'], facilityGroups: ['多级台阶', '台阶'] }
};

const SCHEME_SUBTYPE_RULES = {
  '门槛太高': ['A-1.1', 'A-1.2', 'A-4.1', 'A-4.2', 'A-4.3', 'A-5.1', 'A-5.2', 'A-5.3', 'C-1.1', 'C-1.2', 'C-4', 'C-5'],
  '门太窄': ['A-2.1', 'A-2.2', 'A-2.3', 'A-3.1', 'A-3.2', 'A-3.3', 'A-3.4', 'A-5.1', 'A-5.2', 'A-5.3', 'C-2', 'C-3.1', 'C-3.2', 'C-5'],
  '把手太高或难拧': ['A-2.1', 'A-2.2', 'A-3.2', 'A-3.3', 'C-2', 'C-3.1'],
  '开门太费力': ['A-2.2', 'A-2.3', 'A-4.1', 'A-4.2', 'A-4.3', 'A-5.2', 'A-5.3', 'C-2', 'C-4'],
  '门前空间不足': ['A-2.2', 'A-2.3', 'A-4.2', 'A-4.3', 'C-2', 'C-4'],
  '坡道衔接平台有坎': ['D-1', 'E-1.1'],
  '坡道太陡': ['D-2.2', 'D-3.1', 'D-3.2', 'E-2.1'],
  '坡道太窄': ['D-2.1', 'D-3.1', 'D-3.2', 'E-2.1'],
  '无扶手或高度不对': ['D-2.1', 'D-2.2', 'D-2.3', 'D-3.1', 'D-3.2'],
  '坡面太滑': ['D-3.1', 'D-3.2', 'E-2.1'],
  '坡道破损或头尾无平台': ['D-3.1', 'D-3.2', 'D-2.3'],
  '第一级太高': ['F-1', 'F-3', 'G-1'],
  '台阶面太滑': ['F-2', 'F-5', 'G-3'],
  '扶手缺失或不适': ['F-3', 'F-4', 'G-2.1', 'G-2.2', 'G-2.3'],
  '台阶破损': ['F-1', 'F-4', 'G-1']
};

const SCHEME_FOCUS = {
  'A-1.1': '门槛垫料抹平，处理单元门门槛高差并形成缓坡过渡。',
  'A-1.2': '切除原有门槛，消除单元门出入口高差。',
  'A-2.1': '更换无障碍平开门，提升通行净宽并配置可握扶手。',
  'A-2.2': '更换自动门，降低手动开门负担并保证通行净宽。',
  'A-2.3': '更换推拉门，减少开启占用空间并改善通行宽度。',
  'A-3.1': '拓宽门洞，解决单元门通行净宽不足。',
  'A-3.2': '门洞宽度不足时更换无障碍平开门。',
  'A-3.3': '门洞宽度不足时更换自动门，兼顾便捷开启。',
  'A-3.4': '门洞宽度不足时更换推拉门，兼顾空间适配。',
  'A-4.1': '门槛过高且门体形制不适时，门槛改造并更换平开门。',
  'A-4.2': '门槛过高且开门不便时，门槛改造并更换自动门。',
  'A-4.3': '门槛过高且门前空间受限时，门槛改造并更换推拉门。',
  'A-5.1': '门宽不足且门槛过高时，拓宽门洞、改门槛并更换平开门。',
  'A-5.2': '门宽不足且门槛过高时，拓宽门洞、改门槛并更换自动门。',
  'A-5.3': '门宽不足且门槛过高时，拓宽门洞、改门槛并更换推拉门。',
  'C-1.1': '住宅门门槛垫料过渡，处理门槛过高。',
  'C-1.2': '住宅门门槛切除和找平，处理门槛过高。',
  'C-2': '住宅门更换门体，改善门形制不便、开启费力和通行宽度。',
  'C-3.1': '住宅门拓宽门洞并更换门体，解决门太窄。',
  'C-3.2': '住宅门拓宽门洞并更换门体，解决门太窄。',
  'C-4': '住宅门门槛过高且门形制不便时做组合改造。',
  'C-5': '住宅门门槛过高且门宽不足时做组合改造。',
  C: '住宅门通用改造，按门槛、门宽或开门方式做组合处理。',
  'D-1': '坡道与周边地面衔接不畅时，局部垫料抹平。',
  'D-2.1': '坡道净宽不足时，单侧或双侧拓宽坡道。',
  'D-2.2': '坡道坡度过陡时，延长坡道并降低坡度。',
  'D-2.3': '坡道过长或缺休息平台时，增设中间休息平台。',
  'D-3.1': '坡道坡度、宽度、平台多项不达标时，重建 L 形折返坡道。',
  'D-3.2': '坡道多项不达标时，重建折返式坡道并补齐扶手、防滑和平台。',
  'E-1.1': '缘石坡道与路面衔接不畅时，做衔接部位专项改造。',
  'E-2.1': '缘石坡道坡度、宽度或防滑构造不达标时，做形制整改。',
  'F-1': '一至三阶台阶踏步高度不统一时，拆除并重建台阶。',
  'F-2': '台阶踏步或衔接处存在缝隙、高差、易滑时，垫料抹平并防滑处理。',
  'F-3': '台阶缺少无障碍坡道时，增设轮椅坡道和扶手。',
  'F-4': '台阶高度不统一且缺少坡道时，重建台阶并同步增设坡道。',
  'F-5': '台阶缺少边缘警示时，安装警戒条和提示砖。',
  'G-1': '多级台阶高度不统一时，重建台阶规范踏步尺寸。',
  'G-2.1': '多级台阶缺少无障碍坡道时，增设坡道。',
  'G-2.2': '多级台阶缺少无障碍坡道时，按场地条件增设坡道。',
  'G-2.3': '多级台阶缺少无障碍坡道时，补齐坡道通行设施。',
  'G-3': '多级台阶缺少防滑警戒条时，安装警戒条强化提示。'
};

const PREVIEW_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
const PACKAGE_EXTS = new Set(['.dwg', '.skp', '.skb', '.3dm', '.bak', '.zip', '.rar']);

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const libraryDir = path.resolve(args.libraryDir || DEFAULT_LIBRARY_DIR);
  const outFile = path.resolve(args.out || DEFAULT_OUT);
  const cloudPrefix = normalizeCloudPath(args.cloudPrefix || DEFAULT_CLOUD_PREFIX);
  const fileIdPrefix = normalizeFileIdPrefix(args.fileIdPrefix || '');

  if (!fs.existsSync(libraryDir)) {
    throw new Error(`方案库目录不存在: ${libraryDir}`);
  }

  const records = scanLibrary(libraryDir, cloudPrefix, fileIdPrefix);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2), 'utf8');

  const totalFiles = records.reduce((sum, item) => sum + item.files.length, 0);
  const totalBytes = records.reduce((sum, item) => sum + item.totalSize, 0);
  console.log(`Generated ${records.length} scheme records, ${totalFiles} files, ${formatMB(totalBytes)} MB`);
  console.log(outFile);
}

function scanLibrary(rootDir, cloudPrefix, fileIdPrefix) {
  const records = [];
  const topDirs = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));

  topDirs.forEach((facilityDir) => {
    const schemeDirs = fs.readdirSync(facilityDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(facilityDir, entry.name))
      .filter((dir) => parseSchemeCode(path.basename(dir)));

    schemeDirs.forEach((schemeDir) => {
      const record = buildRecord(rootDir, facilityDir, schemeDir, cloudPrefix, fileIdPrefix);
      if (record) records.push(record);
    });
  });

  return records.sort((a, b) => a.sortOrder - b.sortOrder || a.schemeCode.localeCompare(b.schemeCode));
}

function buildRecord(rootDir, facilityDir, schemeDir, cloudPrefix, fileIdPrefix) {
  const schemeName = path.basename(schemeDir);
  const schemeCode = parseSchemeCode(schemeName);
  if (!schemeCode) return null;

  const schemePrefix = schemeCode.slice(0, 1);
  const meta = PREFIX_META[schemePrefix] || { categories: [], facilityGroups: [] };
  const files = listFiles(schemeDir)
    .map((filePath) => buildFile(rootDir, schemeCode, filePath, cloudPrefix, fileIdPrefix))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const previewFiles = files.filter((file) => file.previewable).slice(0, 6);
  const packageFiles = files.filter((file) => file.packageFile).slice(0, 6);
  const fileGroups = buildFileGroups(files);
  const matchedSubtypes = getMatchedSubtypes(schemeCode);
  const displaySections = buildDisplaySections(schemeCode, meta, matchedSubtypes, files);
  const totalSize = files.reduce((sum, item) => sum + item.size, 0);
  const totalFileCount = files.length;

  return {
    schemeCode,
    code: schemeCode,
    schemePrefix,
    title: schemeName,
    facilityRoot: path.basename(facilityDir),
    facilityGroups: meta.facilityGroups,
    matchedCategories: meta.categories,
    matchedSubtypes,
    schemeSummary: buildSchemeSummary(schemeCode, schemeName, meta, matchedSubtypes),
    displaySections,
    resourceStatus: files.length ? 'ready' : 'placeholder',
    sortOrder: buildSortOrder(schemeCode),
    storagePrefix: `${cloudPrefix}/${schemeCode}`,
    sourceFolder: path.relative(rootDir, schemeDir).replace(/\\/g, '/'),
    files,
    fileGroups,
    previewFiles,
    packageFiles,
    totalFileCount,
    previewFileCount: files.filter((file) => file.previewable).length,
    engineeringFileCount: files.filter((file) => file.packageFile).length,
    totalSize,
    updatedAt: new Date().toISOString()
  };
}

function buildFile(rootDir, schemeCode, filePath, cloudPrefix, fileIdPrefix) {
  const relativeToScheme = path.relative(findSchemeDir(filePath), filePath).replace(/\\/g, '/');
  const relativeToRoot = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const cloudPath = `${cloudPrefix}/${schemeCode}/${relativeToScheme}`;
  const fileID = fileIdPrefix ? `${fileIdPrefix}/${cloudPath}` : '';

  return {
    name: path.basename(filePath),
    ext: ext.replace('.', ''),
    relativePath: relativeToRoot,
    schemeRelativePath: relativeToScheme,
    groupName: getGroupName(relativeToScheme),
    cloudPath,
    fileID,
    size: stat.size,
    previewable: PREVIEW_EXTS.has(ext),
    packageFile: PACKAGE_EXTS.has(ext),
    fileType: PREVIEW_EXTS.has(ext) ? 'preview' : PACKAGE_EXTS.has(ext) ? 'engineering' : 'file'
  };
}

function buildFileGroups(files) {
  const groups = new Map();
  files.forEach((file) => {
    const groupName = file.groupName || '方案文件';
    if (!groups.has(groupName)) {
      groups.set(groupName, {
        groupName,
        title: groupName,
        files: []
      });
    }
    groups.get(groupName).files.push(file);
  });

  return Array.from(groups.values())
    .map((group) => Object.assign(group, {
      files: group.files.sort((a, b) => a.schemeRelativePath.localeCompare(b.schemeRelativePath))
    }))
    .sort((a, b) => buildGroupOrder(a.groupName) - buildGroupOrder(b.groupName) || a.groupName.localeCompare(b.groupName));
}

function buildDisplaySections(schemeCode, meta, matchedSubtypes, files) {
  const drawingFiles = files
    .filter(isDrawingFile)
    .sort(sortDisplayFile);
  const tagCardFiles = files
    .filter((file) => file.name.indexOf('方案标签卡') > -1)
    .sort(sortDisplayFile);
  const materialTableFiles = files
    .filter((file) => (file.name.indexOf('材料清单') > -1 || file.name.indexOf('物料清单') > -1) && file.ext === 'xlsx')
    .sort(sortDisplayFile);
  const constructionFiles = files
    .filter((file) => file.name.indexOf('施工工艺') > -1 || file.name.indexOf('验收标准') > -1)
    .sort(sortDisplayFile);

  return {
    drawingFiles,
    tagCardFiles,
    materialTableFiles,
    constructionFiles,
    tagSummary: buildSchemeSummary(schemeCode, '', meta, matchedSubtypes)
  };
}

function buildSchemeSummary(schemeCode, title, meta, matchedSubtypes) {
  const categories = Array.isArray(meta.categories) ? meta.categories : [];
  const facilityGroups = Array.isArray(meta.facilityGroups) ? meta.facilityGroups : [];
  return {
    category: categories[0] || '',
    facility: facilityGroups[0] || '',
    matchedSubtypes,
    designFocus: SCHEME_FOCUS[schemeCode] || SCHEME_FOCUS[schemeCode.slice(0, 1)] || title || '',
    evidence: matchedSubtypes.length ? `适用于：${matchedSubtypes.join('、')}` : '暂无明确子类标签'
  };
}

function isDrawingFile(file) {
  const groupName = file.groupName || '';
  const name = file.name || '';
  if (groupName.indexOf('施工图纸') > -1) return true;
  return /平面图|立面图|节点|详图|图纸/.test(name) && (file.ext === 'pdf' || file.ext === 'dwg');
}

function sortDisplayFile(a, b) {
  const previewScore = Number(b.previewable === true) - Number(a.previewable === true);
  if (previewScore) return previewScore;
  return a.schemeRelativePath.localeCompare(b.schemeRelativePath);
}

function getGroupName(relativeToScheme) {
  const parts = String(relativeToScheme || '').split('/');
  return parts.length > 1 ? parts[0] : '方案文件';
}

function buildGroupOrder(groupName) {
  const match = String(groupName || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 99;
}

function getMatchedSubtypes(schemeCode) {
  return Object.keys(SCHEME_SUBTYPE_RULES)
    .filter((subtype) => SCHEME_SUBTYPE_RULES[subtype].indexOf(schemeCode) > -1);
}

function findSchemeDir(filePath) {
  let dir = path.dirname(filePath);
  while (dir && dir !== path.dirname(dir)) {
    if (parseSchemeCode(path.basename(dir))) return dir;
    dir = path.dirname(dir);
  }
  return path.dirname(filePath);
}

function listFiles(dir) {
  const result = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath));
    } else if (entry.isFile() && !entry.name.endsWith('.dwl') && !entry.name.endsWith('.dwl2')) {
      result.push(fullPath);
    }
  });
  return result;
}

function parseSchemeCode(name) {
  const match = String(name || '').match(/^([A-Z]-\d+(?:[.-]\d+)?)/);
  return match ? match[1].replace(/-(\d)-(\d)/, '-$1.$2') : '';
}

function buildSortOrder(code) {
  const prefix = code.charCodeAt(0) * 1000000;
  const numbers = code.slice(2).split(/[.-]/).map((item) => Number(item) || 0);
  return prefix + (numbers[0] || 0) * 10000 + (numbers[1] || 0) * 100 + (numbers[2] || 0);
}

function normalizeCloudPath(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '') || DEFAULT_CLOUD_PREFIX;
}

function normalizeFileIdPrefix(value) {
  return String(value || '').trim().replace(/\/+$/g, '');
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (item === '--out') {
      parsed.out = args[i + 1];
      i += 1;
    } else if (item === '--cloud-prefix') {
      parsed.cloudPrefix = args[i + 1];
      i += 1;
    } else if (item === '--file-id-prefix') {
      parsed.fileIdPrefix = args[i + 1];
      i += 1;
    } else if (!parsed.libraryDir) {
      parsed.libraryDir = item;
    }
  }
  return parsed;
}

function formatMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
