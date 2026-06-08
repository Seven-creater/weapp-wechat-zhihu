const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_SUMMARY_ROWS = 500;
const PAGE_SIZE = 100;
const MAX_POINTS = 200;
const MAX_TYPICAL_ISSUES = 9;

const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const COMMUNITY_CENTERS = {
  '楠竹社区': { latitude: 28.06862, longitude: 113.00689 },
  '和美社区': { latitude: 28.0678, longitude: 113.0082 }
};
const COMMUNITY_REPORT_PATHS = {
  '楠竹社区': 'nanzhu',
  '和美社区': 'hemei'
};

const HIGH_RISK_SUBTYPES = new Set([
  '坡道太陡',
  '坡道衔接平台有坎',
  '门槛太高',
  '门太窄',
  '电梯门太窄',
  '挡住无障碍通道',
  '盲道被占用',
  '盲道中断',
  '格栅孔太大'
]);

const MEDIUM_RISK_SUBTYPES = new Set([
  '坡道太窄',
  '无扶手或高度不对',
  '坡面太滑',
  '坡道破损或头尾无平台',
  '台阶面太滑',
  '台阶破损',
  '扶手缺失或不适',
  '按钮太高',
  '无语音或盲文',
  '格栅方向不对',
  '路障不稳',
  '颜色不明显'
]);

const SCHEME_RULES = {
  '入户门|门槛太高': ['A-1.1', 'A-1.2', 'C-1.1'],
  '入户门|门太窄': ['A-2.1', 'A-2.2', 'C-2'],
  '入户门|把手太高或难拧': ['A-3.1', 'A-3.2', 'C-3.1'],
  '入户门|开门太费力': ['A-4.1', 'A-4.2', 'C-4'],
  '入户门|门前空间不足': ['A-5.1', 'A-5.2', 'C-5'],
  '坡道|坡道衔接平台有坎': ['D-1'],
  '坡道|坡道太陡': ['D-2.1', 'D-3.1', 'E-1.1'],
  '坡道|坡道太窄': ['D-2.2', 'D-3.1', 'E-2.1'],
  '坡道|无扶手或高度不对': ['D-2.3', 'D-3.2'],
  '坡道|坡面太滑': ['D-3.1', 'D-3.2'],
  '坡道|坡道破损或头尾无平台': ['D-3.1', 'D-3.2', 'D-2.3'],
  '台阶|第一级太高': ['F-1', 'G-1'],
  '台阶|台阶面太滑': ['F-2', 'G-2.1'],
  '台阶|扶手缺失或不适': ['F-4', 'G-3'],
  '台阶|台阶破损': ['F-5', 'F-1']
};

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const community = toSafeString(event.community, 32);
    if (!ALLOWED_COMMUNITIES.has(community)) {
      return fail('unsupported community');
    }

    const user = await getUser(openid);
    if (!user || user.userType !== 'communityWorker') {
      console.warn('[security] event logged');
      return fail('仅社区工作者可生成社区报告');
    }

    const generatedAt = formatDateTime(new Date());
    const summary = await buildCommunitySummary(community);
    const reportData = buildStructuredReport(community, generatedAt, summary);
    const reportText = buildFallbackReport(community, generatedAt, reportData);
    const reportSections = buildReportSections(reportData, reportText);
    const aiStatus = 'template';
    const htmlResult = await generateAndUploadHtmlReport({
      community,
      generatedAt,
      reportData,
      reportText,
      reportSections,
      aiFallback: false,
      aiErrorMessage: ''
    });

    return {
      success: true,
      community,
      generatedAt,
      stats: reportData.stats,
      overviewCards: reportData.overviewCards,
      issueTypeStats: reportData.issueTypeStats,
      riskStats: reportData.riskStats,
      budgetStats: reportData.budgetStats,
      heatmapPoints: reportData.heatmapPoints,
      typicalIssues: reportData.typicalIssues,
      schemeRecommendations: reportData.schemeRecommendations,
      reportSections,
      reportText,
      htmlReportFileID: htmlResult.fileID,
      htmlReportUrl: htmlResult.tempFileURL,
      htmlReportError: htmlResult.error || '',
      aiFallback: false,
      aiStatus,
      aiErrorType: '',
      aiErrorMessage: ''
    };
  } catch (err) {
    console.error('[generateCommunityReport] failed:', err && err.message ? err.message : err);
    return fail('report generation failed');
  }
};

async function getUser(openid) {
  if (!openid) return null;
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ userType: true })
    .limit(1)
    .get();
  return Array.isArray(res.data) ? res.data[0] : null;
}

async function buildCommunitySummary(community) {
  const where = {
    type: 'issue',
    community
  };
  const countRes = await db.collection('posts').where(where).count();
  const total = Number(countRes && countRes.total) || 0;
  const rows = total > 0 ? await fetchRows(where, Math.min(total, MAX_SUMMARY_ROWS)) : [];

  const points = [];
  const statusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    other: 0
  };
  const categoryCounts = {};
  const subtypeCounts = {};
  const riskCounts = {
    high: 0,
    medium: 0,
    low: 0
  };
  let latestTime = null;

  const normalizedRows = rows.map((row) => {
    const category = toSafeString(row.recognizedCategory || row.categoryName || row.category, 32) || '未分类';
    const subtypes = normalizeSubtypeList(row.recognizedSubtypes, row.recognizedSubtype || row.title || row.content);
    const subtype = subtypes.join('、') || '未分类问题';
    const statusKey = normalizeStatus(row.status);
    const risk = deriveHighestRisk(row, subtypes, statusKey);
    const location = extractLocation(row);
    const time = normalizeDate(row.updateTime || row.createTime);

    statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    subtypes.forEach((item) => {
      subtypeCounts[item] = (subtypeCounts[item] || 0) + 1;
    });
    riskCounts[risk] = (riskCounts[risk] || 0) + 1;

    if (time && (!latestTime || time.getTime() > latestTime.getTime())) {
      latestTime = time;
    }

    if (location) {
      points.push({
        postId: String(row._id || ''),
        latitude: location.latitude,
        longitude: location.longitude,
        title: subtype,
        riskLevel: risk,
        weight: riskToWeight(risk)
      });
    }

    return {
      postId: String(row._id || ''),
      title: toSafeString(row.title || subtype, 60),
      content: toSafeString(row.content || '', 180),
      category,
      subtype,
      subtypes,
      status: statusKey,
      statusText: formatStatus(row.status),
      riskLevel: risk,
      riskText: formatRisk(risk),
      location,
      locationText: formatLocationText(row, location),
      coordinateText: location ? `${location.longitude.toFixed(6)}, ${location.latitude.toFixed(6)}` : '暂无坐标',
      createTime: formatMaybeDate(row.createTime),
      updateTime: formatMaybeDate(row.updateTime),
      confidence: normalizeConfidence(row.recognitionConfidence)
    };
  });

  const center = deriveCenter(points) || COMMUNITY_CENTERS[community];
  return {
    community,
    total,
    updatedAt: latestTime ? formatDateTime(latestTime) : '暂无更新',
    center,
    points: points.slice(0, MAX_POINTS),
    statusCounts,
    categoryCounts,
    subtypeCounts,
    riskCounts,
    rows: normalizedRows
  };
}

async function fetchRows(where, maxRows) {
  const rows = [];
  let skip = 0;
  while (rows.length < maxRows) {
    const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
    const res = await db.collection('posts')
      .where(where)
      .field({
        _id: true,
        title: true,
        content: true,
        location: true,
        status: true,
        category: true,
        categoryName: true,
        recognizedCategory: true,
        recognizedSubtype: true,
        recognizedSubtypes: true,
        recognitionConfidence: true,
        riskLevel: true,
        severity: true,
        urgency: true,
        address: true,
        formattedAddress: true,
        detailAddress: true,
        createTime: true,
        updateTime: true
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
    const batch = Array.isArray(res.data) ? res.data : [];
    rows.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return rows;
}

function buildStructuredReport(community, generatedAt, summary) {
  const issueTypeStats = rankObject(summary.categoryCounts).map((item) => ({
    name: item.name,
    count: item.count,
    percent: summary.total > 0 ? Math.round((item.count / summary.total) * 100) : 0
  }));
  const subtypeRows = rankObject(summary.subtypeCounts);
  const typicalIssues = summary.rows
    .slice()
    .sort((a, b) => riskSortValue(b.riskLevel) - riskSortValue(a.riskLevel))
    .slice(0, MAX_TYPICAL_ISSUES)
    .map((row, index) => ({
      id: `P${index + 1}`,
      postId: row.postId,
      title: row.title || row.subtype,
      category: row.category,
      subtype: row.subtype,
      statusText: row.statusText,
      riskLevel: row.riskLevel,
      riskText: row.riskText,
      location: row.locationText,
      coordinate: row.coordinateText,
      description: buildIssueDescription(row),
      suggestion: buildIssueSuggestion(row.category, (row.subtypes && row.subtypes[0]) || row.subtype),
      standard: buildIssueStandard(row.category, (row.subtypes && row.subtypes[0]) || row.subtype),
      createTime: row.createTime
    }));
  const schemeRecommendations = buildSchemeRecommendations(summary.rows);
  const topIssueText = subtypeRows.slice(0, 3)
    .map((item) => `${item.name}${item.count}条`)
    .join('、') || '暂无集中问题';
  const overviewCards = [
    { label: '障碍信息总数', value: String(summary.total), hint: '社区随手拍问题' },
    { label: '坐标点数量', value: String(summary.points.length), hint: '可用于热力图' },
    { label: '高风险问题', value: String(summary.riskCounts.high || 0), hint: '需优先核查' },
    { label: '最近更新', value: summary.updatedAt, hint: '数据更新时间' }
  ];
  const budgetStats = [
    { label: '单点预算', value: '按方案核算', hint: '适合单个障碍点快速整改' },
    { label: '分段预算', value: '按路线合并', hint: '适合同一通行路径集中处理' },
    { label: '分区预算', value: '按社区片区汇总', hint: '适合年度改造计划' }
  ];
  const heatmapPoints = summary.points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    weight: point.weight,
    riskLevel: point.riskLevel,
    title: point.title
  }));

  return {
    community,
    generatedAt,
    stats: {
      community,
      total: summary.total,
      updatedAt: summary.updatedAt,
      center: summary.center,
      points: summary.points,
      statusCounts: summary.statusCounts,
      categoryCounts: summary.categoryCounts,
      topIssues: subtypeRows.slice(0, 8),
      riskCounts: summary.riskCounts
    },
    overviewCards,
    issueTypeStats,
    riskStats: {
      high: summary.riskCounts.high || 0,
      medium: summary.riskCounts.medium || 0,
      low: summary.riskCounts.low || 0
    },
    budgetStats,
    heatmapPoints,
    typicalIssues,
    schemeRecommendations,
    summaryText: `${community}当前共记录${summary.total}条无障碍障碍信息，重点问题为${topIssueText}。`
  };
}

function buildFallbackReport(community, generatedAt, reportData) {
  const categories = reportData.issueTypeStats
    .slice(0, 5)
    .map((item) => `${item.name}${item.count}条`)
    .join('、') || '暂无分类数据';
  const issues = reportData.stats.topIssues
    .slice(0, 5)
    .map((item) => `${item.name}${item.count}条`)
    .join('、') || '暂无重点问题';
  return [
    `【${community}无障碍环境诊断报告】`,
    `生成时间：${generatedAt}`,
    '',
    `一、总体情况：当前共记录${reportData.stats.total || 0}条障碍信息，最近更新时间为${reportData.stats.updatedAt || '暂无更新'}。`,
    `二、处理状态：待处理${reportData.stats.statusCounts.pending || 0}条，处理中${reportData.stats.statusCounts.processing || 0}条，已完成${reportData.stats.statusCounts.completed || 0}条，其他${reportData.stats.statusCounts.other || 0}条。`,
    `三、设施类型分布：${categories}。`,
    `四、重点问题：${issues}。`,
    `五、治理建议：建议优先核查高风险和空间上集中的障碍点，对同一路线、同一楼栋或同一出入口的问题合并踏勘，统一纳入整改计划。`,
    '',
    '备注：本报告基于云端帖子统计自动生成，仅供社区自查、排查和整改沟通参考。'
  ].join('\n');
}

function buildReportSections(reportData, reportText) {
  const topCategories = reportData.issueTypeStats
    .slice(0, 3)
    .map((item) => `${item.name}${item.count}条`)
    .join('、') || '暂无集中类型';
  const topSchemes = reportData.schemeRecommendations
    .slice(0, 3)
    .map((item) => `${item.code} ${item.title}`)
    .join('；') || '暂无匹配方案';
  return [
    {
      title: '整体结论',
      content: reportData.summaryText
    },
    {
      title: '重点类型',
      content: `当前高频设施类型为：${topCategories}。`
    },
    {
      title: '整改建议',
      content: `建议优先处理高风险问题${reportData.riskStats.high || 0}条，并结合推荐方案：${topSchemes}。`
    },
    {
      title: '报告正文',
      content: reportText
    }
  ];
}

async function generateAndUploadHtmlReport(input) {
  try {
    const html = buildHtmlReport(input);
    const cloudPath = `community-reports/${getCommunityReportPath(input.community)}/${toFileTimestamp(new Date())}.html`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(html, 'utf8')
    });
    const fileID = upload && upload.fileID;
    if (!fileID) {
      return { fileID: '', tempFileURL: '', error: 'upload failed' };
    }
    const urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
    const file = urlRes &&
      Array.isArray(urlRes.fileList) &&
      urlRes.fileList[0];
    return {
      fileID,
      tempFileURL: file && file.tempFileURL ? file.tempFileURL : '',
      error: ''
    };
  } catch (err) {
    console.warn('[generateCommunityReport] html upload fallback:', err && err.message ? err.message : err);
    return {
      fileID: '',
      tempFileURL: '',
      error: 'HTML报告生成失败'
    };
  }
}

function buildHtmlReport(input) {
  const { community, generatedAt, reportData, reportText, aiFallback, aiErrorMessage } = input;
  const heatmapSvg = buildHeatmapSvg(reportData.heatmapPoints);
  const issueRows = reportData.typicalIssues.map((issue) => `
    <div class="problem-card">
      <div class="problem-head">
        <strong>${escapeHtml(issue.id)} ${escapeHtml(issue.subtype)}</strong>
        <span class="risk ${escapeHtml(issue.riskLevel)}">${escapeHtml(issue.riskText)}</span>
      </div>
      <div class="detail-grid">
        <div><span>设施类型</span>${escapeHtml(issue.category)}</div>
        <div><span>位置</span>${escapeHtml(issue.location)}</div>
        <div><span>坐标</span>${escapeHtml(issue.coordinate)}</div>
        <div><span>状态</span>${escapeHtml(issue.statusText)}</div>
      </div>
      <p><b>问题描述：</b>${escapeHtml(issue.description)}</p>
      <p><b>整改建议：</b>${escapeHtml(issue.suggestion)}</p>
      <p><b>参考规范：</b>${escapeHtml(issue.standard)}</p>
    </div>
  `).join('');
  const schemeRows = reportData.schemeRecommendations.map((scheme) => `
    <tr>
      <td>${escapeHtml(scheme.code)}</td>
      <td>${escapeHtml(scheme.title)}</td>
      <td>${escapeHtml(scheme.scenario)}</td>
      <td>${scheme.hitCount}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(community)}无障碍环境诊断报告 | 無界营造</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fb; color: #172033; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { max-width: 980px; margin: 0 auto; padding: 24px; }
    .header { background: linear-gradient(135deg, #0b4fb3, #1d7ed0); color: #fff; border-radius: 18px; padding: 28px; }
    .header h1 { margin: 0 0 8px; font-size: 28px; }
    .section { margin-top: 22px; background: #fff; border: 1px solid #dbe7f6; border-radius: 16px; padding: 20px; box-shadow: 0 8px 22px rgba(15, 62, 130, 0.08); }
    .section-title { margin: 0 0 16px; color: #0b4fb3; font-size: 22px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .card { border: 1px solid #e2edf9; border-radius: 14px; padding: 16px; background: #f8fbff; }
    .num { font-size: 26px; font-weight: 800; color: #0b4fb3; }
    .hint { color: #64748b; font-size: 13px; margin-top: 4px; }
    .bar { margin: 10px 0; }
    .bar-line { height: 10px; border-radius: 999px; background: #edf3fb; overflow: hidden; }
    .bar-fill { height: 10px; border-radius: 999px; background: #1d7ed0; }
    .risk-list { display: flex; gap: 14px; flex-wrap: wrap; }
    .risk-pill { flex: 1; min-width: 140px; padding: 14px; border-radius: 14px; background: #f8fbff; border: 1px solid #e2edf9; }
    .risk.high { color: #dc2626; }
    .risk.medium { color: #f59e0b; }
    .risk.low { color: #2563eb; }
    .heatmap { width: 100%; border-radius: 14px; overflow: hidden; border: 1px solid #dbe7f6; background: #edf4f8; }
    .problem-card { border: 1px solid #e2edf9; border-radius: 14px; padding: 16px; margin-top: 12px; }
    .problem-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .risk { font-weight: 700; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 12px 0; }
    .detail-grid div { background: #f8fbff; border-radius: 10px; padding: 10px; }
    .detail-grid span { display: block; color: #64748b; font-size: 12px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; border-bottom: 1px solid #e2edf9; text-align: left; }
    th { color: #0b4fb3; background: #f8fbff; }
    pre { white-space: pre-wrap; line-height: 1.8; font-family: inherit; }
    .footer { margin: 24px 0 8px; color: #64748b; font-size: 13px; text-align: center; }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <h1>${escapeHtml(community)}无障碍环境诊断报告</h1>
      <div>基于AI智能体与社区障碍信息统计 | 生成日期：${escapeHtml(generatedAt)}</div>
    </header>
    <section class="section">
      <h2 class="section-title">社区概况</h2>
      <div class="grid">${reportData.overviewCards.map((card) => `
        <div class="card"><div class="num">${escapeHtml(card.value)}</div><div>${escapeHtml(card.label)}</div><div class="hint">${escapeHtml(card.hint)}</div></div>
      `).join('')}</div>
      <p>${escapeHtml(reportData.summaryText)}</p>
    </section>
    <section class="section">
      <h2 class="section-title">问题类型统计</h2>
      ${reportData.issueTypeStats.map((item) => `
        <div class="bar"><div>${escapeHtml(item.name)} ${item.count}条</div><div class="bar-line"><div class="bar-fill" style="width:${Math.max(4, item.percent)}%"></div></div></div>
      `).join('') || '<p>暂无分类数据</p>'}
    </section>
    <section class="section">
      <h2 class="section-title">风险量化与预算统计分析</h2>
      <div class="risk-list">
        <div class="risk-pill"><span class="risk high">高风险</span><div class="num">${reportData.riskStats.high}</div></div>
        <div class="risk-pill"><span class="risk medium">中风险</span><div class="num">${reportData.riskStats.medium}</div></div>
        <div class="risk-pill"><span class="risk low">低风险</span><div class="num">${reportData.riskStats.low}</div></div>
      </div>
      <div class="grid" style="margin-top:12px;">${reportData.budgetStats.map((card) => `
        <div class="card"><strong>${escapeHtml(card.label)}</strong><div>${escapeHtml(card.value)}</div><div class="hint">${escapeHtml(card.hint)}</div></div>
      `).join('')}</div>
    </section>
    <section class="section">
      <h2 class="section-title">问题分布热力图</h2>
      <div class="heatmap">${heatmapSvg}</div>
      <p class="hint">红色区域代表高风险或较密集问题点，橙色为中风险，蓝色为低风险。</p>
    </section>
    <section class="section">
      <h2 class="section-title">详细问题清单（含AI诊断建议）</h2>
      ${issueRows || '<p>暂无典型问题。</p>'}
    </section>
    <section class="section">
      <h2 class="section-title">改造方案推荐</h2>
      <table><thead><tr><th>方案编号</th><th>方案名称</th><th>适用场景</th><th>匹配次数</th></tr></thead><tbody>${schemeRows || '<tr><td colspan="4">暂无匹配方案</td></tr>'}</tbody></table>
    </section>
    <section class="section">
      <h2 class="section-title">报告正文</h2>
      ${aiFallback ? `<p class="hint">AI生成暂不可用，已展示系统模板报告。${aiErrorMessage ? `原因：${escapeHtml(aiErrorMessage)}` : ''}</p>` : ''}
      <pre>${escapeHtml(reportText)}</pre>
    </section>
    <div class="footer">报告由“無界营造”系统模板生成，数据源自社区障碍信息统计，仅供社区自查与整改沟通参考。</div>
  </main>
</body>
</html>`;
}

function buildHeatmapSvg(points) {
  const width = 720;
  const height = 360;
  const safePoints = Array.isArray(points) ? points.filter((point) => isValidCoord(point.latitude, point.longitude)) : [];
  const bounds = deriveBounds(safePoints);
  const streets = [
    '<path d="M40 70 H680" stroke="#d6e2ed" stroke-width="14" stroke-linecap="round"/>',
    '<path d="M70 280 H650" stroke="#d6e2ed" stroke-width="12" stroke-linecap="round"/>',
    '<path d="M180 35 V325" stroke="#d6e2ed" stroke-width="12" stroke-linecap="round"/>',
    '<path d="M420 35 V325" stroke="#d6e2ed" stroke-width="12" stroke-linecap="round"/>',
    '<path d="M80 180 C220 120 330 230 520 150" stroke="#d6e2ed" stroke-width="10" fill="none" stroke-linecap="round"/>'
  ].join('');

  if (!safePoints.length || !bounds) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="#edf4f8"/>${streets}<text x="360" y="190" text-anchor="middle" fill="#6b7280" font-size="24">暂无可视化坐标数据</text></svg>`;
  }

  const gradients = [];
  const blobs = safePoints.map((point, index) => {
    const pos = projectPoint(point, bounds, width, height);
    const color = riskColor(point.riskLevel);
    const radius = 36 + Math.round((Number(point.weight) || 0.5) * 36);
    gradients.push(`
      <radialGradient id="g${index}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
        <stop offset="55%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>
    `);
    return `
      <circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="url(#g${index})"/>
      <circle cx="${pos.x}" cy="${pos.y}" r="5" fill="${color}" opacity="0.85"/>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="360" xmlns="http://www.w3.org/2000/svg"><defs>${gradients.join('')}<linearGradient id="legend" x1="0" x2="0" y1="1" y2="0"><stop offset="0%" stop-color="#2563eb"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><rect width="${width}" height="${height}" fill="#edf4f8"/>${streets}${blobs}<rect x="610" y="210" width="18" height="100" fill="url(#legend)"/><text x="640" y="225" fill="#334155" font-size="18">高</text><text x="640" y="310" fill="#334155" font-size="18">低</text></svg>`;
}

function buildIssueDescription(row) {
  if (row.content) return row.content;
  return `${row.category}存在“${row.subtype}”问题，建议结合现场照片和位置记录复核。`;
}

function buildIssueSuggestion(category, subtype) {
  const key = `${category}|${subtype}`;
  const map = {
    '坡道|坡道衔接平台有坎': '优先消除坡道起终点高差，补齐平台过渡并做防滑处理。',
    '坡道|坡道太陡': '复核坡度，按规范调整坡道长度或增设折返平台。',
    '坡道|坡道太窄': '核查净宽，必要时拓宽通行面并清理两侧障碍。',
    '入户门|门槛太高': '采用削低、斜面过渡或成品坡道垫，降低轮椅通行阻力。',
    '台阶|扶手缺失或不适': '按通行方向补设连续扶手，并核查高度和端部安全。',
    '盲道|盲道被占用': '清理占用物，恢复连续通行并补齐提示砖。',
    '路障|挡住无障碍通道': '调整路障位置和间距，保留连续无障碍通行净宽。'
  };
  return map[key] || '建议社区组织现场复核，结合对应标准方案进行整改。';
}

function buildIssueStandard(category, subtype) {
  const key = `${category}|${subtype}`;
  const map = {
    '坡道|坡道衔接平台有坎': '参照《无障碍设计规范》GB 50763-2012 坡道平台与高差处理相关条款。',
    '坡道|坡道太陡': '参照《无障碍设计规范》GB 50763-2012 坡道坡度相关条款。',
    '坡道|无扶手或高度不对': '参照《无障碍设计规范》GB 50763-2012 扶手设置相关条款。',
    '入户门|门槛太高': '参照《无障碍设计规范》GB 50763-2012 出入口高差处理相关条款。',
    '盲道|盲道中断': '参照《无障碍设计规范》GB 50763-2012 盲道连续性相关条款。'
  };
  return map[key] || '参照《无障碍设计规范》GB 50763-2012 与 GB 55019-2021 相关条款。';
}

function buildSchemeRecommendations(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const subtypes = Array.isArray(row.subtypes) && row.subtypes.length ? row.subtypes : [row.subtype];
    subtypes.forEach((subtype) => {
      const codes = SCHEME_RULES[`${row.category}|${subtype}`] || [];
      codes.forEach((code) => {
        const current = map.get(code) || {
          code,
          title: formatSchemeTitle(code, row.category),
          scenario: `${row.category} / ${subtype}`,
          hitCount: 0
        };
        current.hitCount += 1;
        map.set(code, current);
      });
    });
  });
  return Array.from(map.values())
    .sort((a, b) => b.hitCount - a.hitCount || a.code.localeCompare(b.code))
    .slice(0, 8);
}

function formatSchemeTitle(code, category) {
  if (code.startsWith('A-')) return `${code}-单元门改造`;
  if (code.startsWith('C-')) return `${code}-住宅门改造`;
  if (code.startsWith('D-')) return `${code}-轮椅坡道改造方案`;
  if (code.startsWith('E-')) return `${code}-缘石坡道改造`;
  if (code.startsWith('F-')) return `${code}-台阶改造`;
  if (code.startsWith('G-')) return `${code}-多级台阶改造`;
  return `${code}-${category || '无障碍'}改造方案`;
}

function normalizeSubtypeList(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  source.concat(fallback ? [fallback] : []).forEach((item) => {
    const subtype = toSafeString(item, 40);
    if (!subtype || seen.has(subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });
  return result;
}

function deriveHighestRisk(row, subtypes, statusKey) {
  const ranked = (Array.isArray(subtypes) && subtypes.length ? subtypes : [''])
    .map((subtype) => deriveRiskLevel(row, subtype, statusKey))
    .sort((a, b) => riskSortValue(b) - riskSortValue(a));
  return ranked[0] || 'low';
}

function deriveRiskLevel(row, subtype, statusKey) {
  const explicit = normalizeRisk(row.riskLevel || row.severity || row.urgency);
  if (explicit) return explicit;
  if (statusKey === 'completed') return 'low';
  if (HIGH_RISK_SUBTYPES.has(subtype)) return 'high';
  if (MEDIUM_RISK_SUBTYPES.has(subtype)) return 'medium';
  if (statusKey === 'processing') return 'medium';
  return 'low';
}

function normalizeRisk(value) {
  const text = toSafeString(value, 20).toLowerCase();
  if (['high', '高', '高风险'].includes(text)) return 'high';
  if (['medium', 'middle', '中', '中风险'].includes(text)) return 'medium';
  if (['low', '低', '低风险'].includes(text)) return 'low';
  return '';
}

function riskToWeight(risk) {
  if (risk === 'high') return 0.95;
  if (risk === 'medium') return 0.65;
  return 0.35;
}

function riskSortValue(risk) {
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  return 1;
}

function formatRisk(risk) {
  if (risk === 'high') return '高风险';
  if (risk === 'medium') return '中风险';
  return '低风险';
}

function riskColor(risk) {
  if (risk === 'high') return '#dc2626';
  if (risk === 'medium') return '#f59e0b';
  return '#2563eb';
}

function extractLocation(row) {
  const location = row && row.location;
  if (!location) return null;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    const longitude = Number(location.coordinates[0]);
    const latitude = Number(location.coordinates[1]);
    if (isValidCoord(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  const latitude = Number(location.latitude ?? location._latitude);
  const longitude = Number(location.longitude ?? location._longitude);
  if (isValidCoord(latitude, longitude)) {
    return { latitude, longitude };
  }
  return null;
}

function formatLocationText(row, location) {
  return toSafeString(row.detailAddress || row.formattedAddress || row.address, 80) ||
    (location ? `${location.longitude.toFixed(6)}, ${location.latitude.toFixed(6)}` : '暂无位置描述');
}

function deriveCenter(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const sum = points.reduce((acc, point) => ({
    latitude: acc.latitude + point.latitude,
    longitude: acc.longitude + point.longitude
  }), { latitude: 0, longitude: 0 });
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length
  };
}

function deriveBounds(points) {
  if (!points.length) return null;
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  points.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.0005);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.0005);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad
  };
}

function projectPoint(point, bounds, width, height) {
  const x = ((point.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * (width - 80) + 40;
  const y = ((bounds.maxLat - point.latitude) / (bounds.maxLat - bounds.minLat || 1)) * (height - 60) + 30;
  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function normalizeStatus(value) {
  const status = toSafeString(value, 32);
  if (['completed', 'done', 'resolved', '已完成'].includes(status)) return 'completed';
  if (['processing', 'in_progress', '处理中'].includes(status)) return 'processing';
  if (['pending', 'open', 'todo', '待处理'].includes(status)) return 'pending';
  return 'other';
}

function formatStatus(value) {
  const status = normalizeStatus(value);
  if (status === 'completed') return '已完成';
  if (status === 'processing') return '处理中';
  if (status === 'pending') return '待处理';
  return '其他';
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value.getTime === 'function') return value;
  return null;
}

function formatMaybeDate(value) {
  const date = normalizeDate(value);
  return date ? formatDateTime(date) : '';
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence <= 0) return 0;
  return Math.min(1, confidence);
}

function rankObject(value) {
  return Object.keys(value || {})
    .map((name) => ({ name, count: Number(value[name]) || 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
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

function toFileTimestamp(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return [
    chinaTime.getUTCFullYear(),
    pad2(chinaTime.getUTCMonth() + 1),
    pad2(chinaTime.getUTCDate()),
    pad2(chinaTime.getUTCHours()),
    pad2(chinaTime.getUTCMinutes()),
    pad2(chinaTime.getUTCSeconds())
  ].join('');
}

function getCommunityReportPath(community) {
  return COMMUNITY_REPORT_PATHS[community] || 'unknown';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidCoord(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return true;
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fail(error) {
  return {
    success: false,
    error
  };
}
