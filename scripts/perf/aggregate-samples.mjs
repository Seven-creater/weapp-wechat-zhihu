import fs from 'node:fs/promises';
import path from 'node:path';

const WIFI_FIRST_SCREEN_P95_LIMIT = 2500;
const G4_FIRST_SCREEN_P95_LIMIT = 4200;
const REQUEST_P95_LIMIT = 8;
const PAYLOAD_P95_LIMIT_BYTES = 350 * 1024;

async function main() {
  const inputFiles = process.argv.slice(2);
  if (!inputFiles.length) {
    console.error('Usage: node scripts/perf/aggregate-samples.mjs <sample1.json> [sample2.json ...]');
    process.exit(1);
  }

  const records = [];
  for (const file of inputFiles) {
    const absolutePath = path.resolve(file);
    const text = await fs.readFile(absolutePath, 'utf8');
    const json = JSON.parse(stripBom(text));
    const routeSummaries = Array.isArray(json.routeSummaries) ? json.routeSummaries : [];
    const networkType = normalizeNetworkType(json.networkType);
    const runId = safeText(json.runId) || path.basename(absolutePath);

    for (const summary of routeSummaries) {
      const route = safeText(summary.route);
      if (!route) continue;
      records.push({
        sourceFile: absolutePath,
        runId,
        networkType,
        route,
        firstScreenSamples: pickSamples(summary.firstScreen, summary.sampleCount),
        requestSamples: pickSamples(summary.requests, summary.sampleCount),
        payloadSamples: pickSamples(summary.payload, summary.sampleCount)
      });
    }
  }

  if (!records.length) {
    throw new Error('No route summaries found in input files');
  }

  const grouped = groupByRouteAndNetwork(records);
  const reportRows = [];
  grouped.forEach((bucket) => {
    const first = metricStats(bucket.firstScreenSamples);
    const req = metricStats(bucket.requestSamples);
    const payload = metricStats(bucket.payloadSamples);
    reportRows.push({
      route: bucket.route,
      networkType: bucket.networkType,
      sampleCount: Math.max(first.count, req.count, payload.count),
      firstScreen: first,
      requests: req,
      payload
    });
  });

  reportRows.sort((a, b) => {
    if (a.networkType !== b.networkType) {
      return a.networkType.localeCompare(b.networkType);
    }
    return b.firstScreen.p95 - a.firstScreen.p95;
  });

  const overLimitItems = buildOverLimitItems(reportRows);
  const markdown = buildMarkdown({
    inputFiles: inputFiles.map((item) => path.resolve(item)),
    generatedAt: new Date().toISOString(),
    rows: reportRows,
    overLimitItems
  });

  const outputDir = path.resolve('reports');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'perf-report.md');
  await fs.writeFile(outputPath, markdown, 'utf8');

  console.log(`Generated: ${outputPath}`);
}

function groupByRouteAndNetwork(records) {
  const map = new Map();
  for (const row of records) {
    const key = `${row.route}__${row.networkType}`;
    if (!map.has(key)) {
      map.set(key, {
        route: row.route,
        networkType: row.networkType,
        firstScreenSamples: [],
        requestSamples: [],
        payloadSamples: [],
        sources: new Set()
      });
    }
    const bucket = map.get(key);
    appendSamples(bucket.firstScreenSamples, row.firstScreenSamples);
    appendSamples(bucket.requestSamples, row.requestSamples);
    appendSamples(bucket.payloadSamples, row.payloadSamples);
    bucket.sources.add(row.sourceFile);
  }
  return map;
}

function pickSamples(metric = {}, fallbackCount = 0) {
  if (Array.isArray(metric.samples) && metric.samples.length > 0) {
    return metric.samples.map(toNumber).filter((n) => Number.isFinite(n) && n >= 0);
  }
  const count = toInteger(fallbackCount, 0);
  if (count <= 0) return [];
  const p50 = toNumber(metric.p50);
  const p95 = toNumber(metric.p95);
  const max = toNumber(metric.max);
  return approximateSamples(count, p50, p95, max);
}

function approximateSamples(count, p50, p95, max) {
  const safeP50 = Number.isFinite(p50) ? p50 : 0;
  const safeP95 = Number.isFinite(p95) ? p95 : safeP50;
  const safeMax = Number.isFinite(max) ? max : Math.max(safeP50, safeP95);
  const arr = new Array(count).fill(safeP50);
  if (count >= 2) {
    const p95Index = Math.max(0, Math.floor(count * 0.95) - 1);
    arr[p95Index] = Math.max(arr[p95Index], safeP95);
    arr[count - 1] = Math.max(safeMax, arr[count - 1]);
  }
  return arr;
}

function metricStats(values) {
  const clean = (values || []).map(toNumber).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!clean.length) {
    return { count: 0, avg: 0, p50: 0, p95: 0, max: 0 };
  }
  const sum = clean.reduce((acc, n) => acc + n, 0);
  return {
    count: clean.length,
    avg: Math.round(sum / clean.length),
    p50: percentile(clean, 50),
    p95: percentile(clean, 95),
    max: Math.round(clean[clean.length - 1])
  };
}

function buildOverLimitItems(rows) {
  const items = [];
  for (const row of rows) {
    const firstLimit = row.networkType === 'wifi' ? WIFI_FIRST_SCREEN_P95_LIMIT : G4_FIRST_SCREEN_P95_LIMIT;
    const firstExceeded = row.firstScreen.p95 > firstLimit;
    const reqExceeded = row.requests.p95 > REQUEST_P95_LIMIT;
    const payloadExceeded = row.payload.p95 > PAYLOAD_P95_LIMIT_BYTES;
    if (!firstExceeded && !reqExceeded && !payloadExceeded) continue;

    const advice = [];
    if (reqExceeded) advice.push('Prioritize request dedupe, request merge, and batch query.');
    if (payloadExceeded) advice.push('Prioritize field projection and list/detail field mode.');
    if (firstExceeded && !reqExceeded && !payloadExceeded) {
      advice.push('Prioritize setData payload reduction and defer non-first-screen work.');
    }
    items.push({
      route: row.route,
      networkType: row.networkType,
      firstScreenP95: row.firstScreen.p95,
      requestsP95: row.requests.p95,
      payloadP95: row.payload.p95,
      advice
    });
  }
  return items;
}

function buildMarkdown({ inputFiles, generatedAt, rows, overLimitItems }) {
  const lines = [];
  lines.push('# Mini Program Performance Report');
  lines.push('');
  lines.push(`- Generated At: ${generatedAt}`);
  lines.push(`- Input Files: ${inputFiles.length}`);
  lines.push('');
  lines.push('## Route + Network Metrics');
  lines.push('');
  lines.push('| route | network | count | first(ms) avg/p50/p95/max | requests avg/p50/p95/max | payload(KB) avg/p50/p95/max |');
  lines.push('| --- | --- | ---: | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.route} | ${row.networkType} | ${row.sampleCount} | ${formatStats(row.firstScreen)} | ${formatStats(row.requests)} | ${formatStatsKB(row.payload)} |`);
  }
  lines.push('');
  lines.push('## Over-limit Items');
  lines.push('');
  if (!overLimitItems.length) {
    lines.push('- None');
  } else {
    for (const item of overLimitItems) {
      lines.push(`- ${item.route} [${item.networkType}] firstScreen p95=${item.firstScreenP95}ms, requests p95=${item.requestsP95}, payload p95=${Math.round(item.payloadP95 / 1024)}KB`);
      lines.push(`  Advice: ${item.advice.join(' ')}`);
    }
  }
  lines.push('');
  lines.push('## Thresholds');
  lines.push('');
  lines.push(`- First screen p95: Wi-Fi <= ${WIFI_FIRST_SCREEN_P95_LIMIT}ms, 4G <= ${G4_FIRST_SCREEN_P95_LIMIT}ms`);
  lines.push(`- Request count p95: <= ${REQUEST_P95_LIMIT} per page`);
  lines.push(`- Payload p95: <= ${Math.round(PAYLOAD_P95_LIMIT_BYTES / 1024)}KB per page`);
  lines.push('');
  return lines.join('\n');
}

function formatStats(stats) {
  return `${stats.avg}/${stats.p50}/${stats.p95}/${stats.max}`;
}

function formatStatsKB(stats) {
  return `${Math.round(stats.avg / 1024)}/${Math.round(stats.p50 / 1024)}/${Math.round(stats.p95 / 1024)}/${Math.round(stats.max / 1024)}`;
}

function appendSamples(target, samples) {
  if (!Array.isArray(samples)) return;
  for (const value of samples) {
    const n = toNumber(value);
    if (Number.isFinite(n) && n >= 0) {
      target.push(n);
    }
  }
}

function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function normalizeNetworkType(value) {
  const text = safeText(value).toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('wifi')) return 'wifi';
  if (text.includes('4g')) return '4g';
  return text;
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripBom(text) {
  if (typeof text !== 'string') return '';
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function toInteger(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
