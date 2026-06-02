const CATEGORY_SPEC_CLAUSES = {
  '台阶': '《无障碍设计规范》GB 50763-2012 第3.6.1、3.6.2条',
  '入户门': '《无障碍设计规范》GB 50763-2012 第3.5.3、3.5.4条',
  '电梯': '《无障碍设计规范》GB 50763-2012 第3.7.1、3.7.3条',
  '坡道': '《无障碍设计规范》GB 50763-2012 第3.4.4、3.4.5、3.4.6条',
  '雨水箅子': '《无障碍设计规范》GB 50763-2012 第3.1.5条',
  '路障': '《无障碍设计规范》GB 50763-2012 第3.1.1、3.1.2条',
  '盲道': '《无障碍设计规范》GB 50763-2012 第3.2.1、3.2.2条'
};

const SUBTYPE_KNOWLEDGE = {
  '第一级太高': {
    requirement: '台阶踏步高差应均匀、易识别，入口处不应形成突兀高差。',
    deviation: '照片或描述显示首级台阶高差明显，需现场复核踏步高度。',
    risk: '高',
    priority: '调整入口高差，增设缓坡或补平过渡，降低轮椅、老人和推车通行风险。',
    optimize: '在踏步边缘增加清晰警示和防滑处理。'
  },
  '台阶面太滑': {
    requirement: '台阶踏面应平整、防滑，并在边缘设置清晰提示。',
    deviation: '照片或描述显示踏面存在湿滑、光面或防滑不足现象。',
    risk: '中',
    priority: '更换或加铺防滑面层，重点处理踏步边缘和常积水区域。',
    optimize: '补充警示条和排水措施，减少雨天滑倒风险。'
  },
  '扶手缺失或不适': {
    requirement: '台阶或坡道两侧宜设置连续扶手，扶手高度、握持尺寸应便于抓握。',
    deviation: '照片或描述显示扶手缺失、断续或高度不适。',
    risk: '高',
    priority: '补设连续扶手，并校核高度、端部延伸和握持空间。',
    optimize: '结合儿童、老人和轮椅陪护人群设置双层扶手。'
  },
  '台阶破损': {
    requirement: '台阶踏面、踢面应完整平顺，不应有松动、破损和明显缺角。',
    deviation: '照片或描述显示台阶存在破损或不平整。',
    risk: '中',
    priority: '修补破损踏步，恢复平整、防滑和边缘识别。',
    optimize: '同步检查排水和基层松动，避免反复破损。'
  },
  '门槛太高': {
    requirement: '出入口门槛应平顺过渡，门槛高度不应形成轮椅通行障碍。',
    deviation: '照片或描述显示门槛明显高出地面，轮椅或助行器通过困难。',
    risk: '高',
    priority: '降低门槛或增设小坡道，消除门内外高差。',
    optimize: '同步处理门前平台平整度和防滑面层。'
  },
  '门太窄': {
    requirement: '通行门净宽应满足轮椅通行及回转需求。',
    deviation: '照片或描述显示门洞或开启后净宽不足。',
    risk: '高',
    priority: '扩大门洞净宽或调整门扇开启方式，保证轮椅顺畅通过。',
    optimize: '复核门前操作空间，避免改造后仍无法回转。'
  },
  '把手太高或难拧': {
    requirement: '门把手应设在便于轮椅使用者触及的位置，并宜采用易握持形式。',
    deviation: '照片或描述显示把手过高、旋拧困难或不便单手操作。',
    risk: '中',
    priority: '更换为低位、易握持门把手或拉手，降低开门操作难度。',
    optimize: '优先选用下压式、杠杆式或自动辅助开启装置。'
  },
  '开门太费力': {
    requirement: '门扇开启力度应便于行动不便者独立使用。',
    deviation: '照片或描述显示门扇较重、闭门器阻力过大或开启不顺畅。',
    risk: '中',
    priority: '调整闭门器阻尼、检修合页轨道，必要时增加自动门或助力装置。',
    optimize: '保留足够停留时间和安全防夹措施。'
  },
  '门前空间不足': {
    requirement: '门前应有满足轮椅停留、转向和开门操作的平整空间。',
    deviation: '照片或描述显示门前平台狭窄、被占用或转身空间不足。',
    risk: '中',
    priority: '清理门前障碍并扩展平台，保证轮椅停留和转向。',
    optimize: '优化门扇开启方向，减少与通行路径冲突。'
  },
  '电梯门太窄': {
    requirement: '无障碍电梯门净宽应满足轮椅进出需求。',
    deviation: '照片或描述显示电梯门净宽不足或进出空间受限。',
    risk: '高',
    priority: '复核电梯门净宽，必要时纳入电梯更新或入口改造。',
    optimize: '清理电梯厅障碍，保证门前候梯空间。'
  },
  '按钮太高': {
    requirement: '电梯呼叫和轿厢按钮应设置在轮椅使用者可触及高度范围内。',
    deviation: '照片或描述显示按钮安装过高或触达不便。',
    risk: '中',
    priority: '增设低位按钮或辅助呼叫装置。',
    optimize: '配合盲文、凸字和语音提示提升识别性。'
  },
  '无语音或盲文': {
    requirement: '无障碍电梯宜配置语音报站、盲文或凸字按钮等信息提示。',
    deviation: '照片或描述显示缺少语音、盲文或可触摸提示。',
    risk: '中',
    priority: '补充语音报站、盲文按钮和楼层到达提示。',
    optimize: '提高按钮对比度，便于低视力人群识别。'
  },
  '开关门太快': {
    requirement: '电梯门开启时间和防夹保护应满足行动不便者安全进出。',
    deviation: '照片或描述显示开关门速度较快或停留时间不足。',
    risk: '中',
    priority: '调整电梯门保持时间，检查光幕或防夹保护。',
    optimize: '在高峰时段加强提示和维护巡检。'
  },
  '坡道太陡': {
    requirement: '轮椅坡道坡度应按高差控制，常用坡度不宜陡于1:12。',
    deviation: '照片或描述显示坡道坡度偏陡，轮椅上行费力、下行制动困难。',
    risk: '高',
    priority: '延长坡道或调整坡面标高，降低坡度至可通行范围。',
    optimize: '同步增设休息平台、防滑面层和双侧扶手。'
  },
  '坡道太窄': {
    requirement: '轮椅坡道净宽应满足轮椅通行，常用净宽不应小于1.20m。',
    deviation: '照片或描述显示坡道净宽不足或被两侧构件压缩。',
    risk: '高',
    priority: '拓宽坡道净宽，清除侧向障碍，保证轮椅直行通行。',
    optimize: '复核转弯处和平台宽度，避免局部瓶颈。'
  },
  '无扶手或高度不对': {
    requirement: '坡道两侧应设置连续扶手，扶手高度和端部延伸应符合使用要求。',
    deviation: '照片或描述显示坡道无扶手、扶手不连续或高度不适。',
    risk: '高',
    priority: '补设连续双侧扶手，并校核高度、端部延伸和防撞收头。',
    optimize: '在公共入口优先采用双层扶手，兼顾儿童和低位使用者。'
  },
  '坡面太滑': {
    requirement: '坡道坡面应坚固、平整、防滑，雨天不应形成明显滑倒风险。',
    deviation: '照片或描述显示坡面光滑、积水或防滑不足。',
    risk: '中',
    priority: '更换防滑面层或增加防滑条，修正积水点。',
    optimize: '完善坡道排水，减少湿滑和结冰风险。'
  },
  '坡道破损或头尾无平台': {
    requirement: '坡道起止处应设置平整平台，坡面不应破损、沉陷或松动。',
    deviation: '照片或描述显示坡道破损，或起止端缺少水平缓冲平台。',
    risk: '高',
    priority: '修复破损坡面并补足起止平台，保证轮椅停留和转换方向。',
    optimize: '同步检查基层沉降和排水，避免修补后再次开裂。'
  },
  '坡道衔接平台有坎': {
    requirement: '坡道与平台、道路衔接处应平顺，不应出现阻碍轮椅通行的突起高差。',
    deviation: '照片或描述显示坡道衔接处存在坎或明显高差。',
    risk: '高',
    priority: '打磨或补平衔接高差，形成连续平顺过渡。',
    optimize: '在衔接处增加防滑与醒目标识，便于识别和维护。'
  },
  '格栅孔太大': {
    requirement: '雨水箅子孔隙应避免卡住轮椅小轮、手杖或鞋跟。',
    deviation: '照片或描述显示格栅孔隙偏大。',
    risk: '中',
    priority: '更换小孔径或无障碍友好型雨水箅子。',
    optimize: '优先选用防滑、承载能力满足要求的成品构件。'
  },
  '箅子破损或缺失': {
    requirement: '雨水箅子应完整、稳固，与周边路面平顺衔接。',
    deviation: '照片或描述显示箅子破损、松动或缺失。',
    risk: '高',
    priority: '立即更换或修复破损箅子，临时设置安全围护。',
    optimize: '检查井框沉降和周边路面，避免形成二次高差。'
  },
  '格栅方向不对': {
    requirement: '格栅方向应避免顺行方向形成卡轮风险。',
    deviation: '照片或描述显示格栅开口方向与通行方向不利。',
    risk: '中',
    priority: '调整箅子方向或更换横向安全格栅。',
    optimize: '结合通行流线统一检查相邻排水构件。'
  },
  '间距太窄': {
    requirement: '通行路径净宽应连续满足轮椅、助行器和推车通行。',
    deviation: '照片或描述显示路障间距过窄。',
    risk: '高',
    priority: '调整路障间距，恢复连续无障碍通行宽度。',
    optimize: '保留管理需求的同时采用可识别、可绕行的布置方式。'
  },
  '无醒目标识': {
    requirement: '通行障碍物应有醒目标识，避免低视力人群碰撞。',
    deviation: '照片或描述显示路障颜色或标识不明显。',
    risk: '中',
    priority: '增加高对比警示标识和夜间反光提示。',
    optimize: '在障碍物前设置可触知提示，提升盲人识别。'
  },
  '路障不稳': {
    requirement: '道路设施应稳固可靠，不应倾倒、移位或产生绊倒风险。',
    deviation: '照片或描述显示路障松动、不稳或易倾倒。',
    risk: '中',
    priority: '加固或更换路障，消除倾倒和绊倒隐患。',
    optimize: '统一路障规格，便于后续巡检维护。'
  },
  '挡住无障碍通道': {
    requirement: '无障碍通道应保持连续、畅通，不应被固定或临时设施占用。',
    deviation: '照片或描述显示路障占用无障碍通道。',
    risk: '高',
    priority: '移除或调整占道设施，恢复无障碍通行线。',
    optimize: '建立巡查机制，减少临时占用反复出现。'
  },
  '盲道中断': {
    requirement: '盲道应连续设置，并与出入口、公交站、过街设施等有效衔接。',
    deviation: '照片或描述显示盲道路径中断。',
    risk: '高',
    priority: '补齐中断盲道，恢复连续导向。',
    optimize: '同步校核起终点提示砖和转向提示砖。'
  },
  '盲道被占用': {
    requirement: '盲道上不得堆放障碍物或被设施占用。',
    deviation: '照片或描述显示盲道被车辆、设施或杂物占用。',
    risk: '高',
    priority: '清除占用物并建立日常巡查管理。',
    optimize: '设置提醒标识或物理边界，降低再次占用概率。'
  },
  '盲道破损': {
    requirement: '盲道砖应完整、稳固、触感清晰。',
    deviation: '照片或描述显示盲道破损、松动或缺失。',
    risk: '中',
    priority: '更换破损盲道砖，恢复触感连续性。',
    optimize: '检查基层沉降，避免局部修补后再次松动。'
  },
  '颜色不明显': {
    requirement: '盲道宜与相邻路面形成明显色差，便于低视力人群识别。',
    deviation: '照片或描述显示盲道与周边路面对比度不足。',
    risk: '低',
    priority: '更换或翻新高对比盲道砖。',
    optimize: '避免使用与周边铺装过于接近的颜色。'
  },
  '起点或终点缺提示砖': {
    requirement: '盲道起点、终点、转弯和危险位置应设置提示砖。',
    deviation: '照片或描述显示关键节点缺少提示砖。',
    risk: '中',
    priority: '补设提示砖，明确起止、转向和危险边界。',
    optimize: '结合现场流线统一校核提示砖位置。'
  }
};

function buildDiagnosisReport(input = {}) {
  const recognition = input.recognition || {};
  const category = toText(recognition.recognizedCategory, 32) || '未识别';
  const subtypes = normalizeRecognitionSubtypes(recognition);
  const subtypeText = subtypes.join('、') || '未识别';
  const primaryKnowledge = SUBTYPE_KNOWLEDGE[subtypes[0]] || {};
  const schemes = Array.isArray(input.matchedSchemes) ? input.matchedSchemes : [];
  const locationText = buildLocationText(input);
  const schemeText = buildSchemeText(category, subtypeText, schemes);
  const conclusion = subtypes.some((subtype) => (SUBTYPE_KNOWLEDGE[subtype] || {}).risk === '高') ? '不合规' : '部分不合规';

  return [
    '【无障碍设施AI诊断报告】',
    `诊断时间：${formatDateTime(new Date())}`,
    `设施类型：${category} / ${subtypeText}`,
    '检测方式：AI图像识别 + 用户补充核验',
    '',
    `▌合规性结论：${conclusion}`,
    '',
    '▌关键问题清单（按严重程度排序）',
    buildIssueList(input.content, category, subtypes, locationText),
    '',
    '▌整改建议',
    '1. 优先整改项：',
    buildAdviceLines(subtypes, 'priority') || `   - ${primaryKnowledge.priority || '先消除影响通行安全的高差、占用或破损问题，并进行现场复核。'}`,
    '2. 优化提升项：',
    buildAdviceLines(subtypes, 'optimize') || `   - ${primaryKnowledge.optimize || '结合周边通行流线完善标识、防滑和日常维护。'}`,
    '',
    '▌适配整改方案（系统推荐）',
    schemeText,
    '',
    '▌备注',
    '- 本诊断结果基于现场照片与用户提供信息生成，仅供社区自查与整改参考。',
    '- 涉及结构安全或重大改造的，建议由专业机构现场勘查后实施。'
  ].join('\n');
}

function normalizeRecognitionSubtypes(recognition) {
  const source = Array.isArray(recognition.recognizedSubtypes)
    ? recognition.recognizedSubtypes
    : [];
  const fallback = toText(recognition.recognizedSubtype, 64);
  const seen = new Set();
  const result = [];
  source.concat(fallback ? [fallback] : []).forEach((item) => {
    const subtype = toText(item, 64);
    if (!subtype || seen.has(subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });
  return result.length ? result : ['未识别'];
}

function buildIssueList(content, category, subtypes, locationText) {
  return subtypes.map((subtype, index) => {
    const knowledge = SUBTYPE_KNOWLEDGE[subtype] || {};
    const issueDescription = buildIssueDescription(content, category, subtype, knowledge);
    return [
      `${index + 1}. 问题点：${subtype}`,
      `   位置：${locationText}`,
      `   描述：${issueDescription}`,
      `   对应规范：${CATEGORY_SPEC_CLAUSES[category] || '《无障碍设计规范》GB 50763-2012 相关条款'}`,
      `   规范要求：${knowledge.requirement || '无障碍设施应保证连续、安全、便捷通行。'}`,
      `   现状偏差：${knowledge.deviation || '现场照片或用户描述显示该设施存在通行障碍，需现场复核。'}`,
      `   风险等级：${knowledge.risk || '中'}`
    ].join('\n');
  }).join('\n\n');
}

function buildAdviceLines(subtypes, field) {
  const lines = subtypes
    .map((subtype) => {
      const knowledge = SUBTYPE_KNOWLEDGE[subtype] || {};
      return toText(knowledge[field], 160);
    })
    .filter(Boolean);
  return Array.from(new Set(lines))
    .slice(0, 3)
    .map((line) => `   - ${line}`)
    .join('\n');
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

function buildIssueDescription(content, category, subtype, knowledge) {
  const userText = toText(content, 120);
  const base = stripTrailingPunctuation(knowledge.deviation || `${category}存在“${subtype}”问题`);
  if (!userText) return base;
  return `${base}；用户补充：${userText}`;
}

function buildSchemeText(category, subtypeText, schemes) {
  const readySchemes = schemes
    .filter((scheme) => scheme && scheme.resourceStatus !== 'placeholder')
    .slice(0, 3);

  if (!readySchemes.length) {
    return [
      '方案编号：暂无匹配方案',
      `适用场景：${category} / ${subtypeText}`,
      '核心措施：当前方案库暂未配置该问题的标准化改造包。',
      '预估影响：建议先完成现场复核，待方案库补齐后再生成施工级方案。'
    ].join('\n');
  }

  const codes = readySchemes.map((scheme) => scheme.code || scheme.schemeCode).filter(Boolean).join('、');
  const focuses = readySchemes
    .map((scheme) => {
      const summary = scheme.schemeSummary || {};
      return toText(summary.designFocus, 120) || toText(scheme.title, 120);
    })
    .filter(Boolean);

  return [
    `方案编号：${codes}`,
    `适用场景：${category} / ${subtypeText}`,
    `核心措施：${focuses.length ? focuses.join('；') : '调用方案库中匹配的施工图纸、方案标签卡和施工物料表。'}`,
    `预估影响：可针对“${subtypeText}”降低通行阻碍与安全风险，提升老人、轮椅使用者及低视力人群的通行体验。`
  ].join('\n');
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

function stripTrailingPunctuation(value) {
  return toText(value, 200).replace(/[。；;,.，、\s]+$/g, '');
}

function toText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

module.exports = {
  buildDiagnosisReport
};
