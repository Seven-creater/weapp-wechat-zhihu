const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const METRIC_COLLECTION = 'perf_page_metrics';
const MAX_SUMMARY_SIZE = 300;
const MAX_ROUTE_LENGTH = 120;
const MAX_STR_LEN = 64;
const MAX_NUMBER = 1e9;

let sharedAuth = null;
let startTrace = (name) => ({ name, startedAt: Date.now() });
let endTrace = (trace, result) => result;
let failTrace = () => {};
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[reportPerfMetrics] shared auth unavailable');
}
try {
  const metrics = require('../_shared/metrics');
  startTrace = metrics.startTrace || startTrace;
  endTrace = metrics.endTrace || endTrace;
  failTrace = metrics.failTrace || failTrace;
} catch (err) {
  console.warn('[reportPerfMetrics] shared metrics unavailable');
}

exports.main = async (event = {}) => {
  const trace = startTrace('reportPerfMetrics');
  const { OPENID } = cloud.getWXContext();

  try {
    if (!OPENID) {
      return endTrace(trace, fail('unauthorized'));
    }

    const authorized = await canUpload(OPENID);
    if (!authorized) {
      return endTrace(trace, fail('forbidden'));
    }

    const payload = validatePayload(event);
    if (!payload.ok) {
      return endTrace(trace, fail(payload.error));
    }

    const now = db.serverDate();
    const collection = db.collection(METRIC_COLLECTION);
    let created = 0;
    let updated = 0;

    for (let i = 0; i < payload.value.routeSummaries.length; i += 1) {
      const summary = payload.value.routeSummaries[i];
      const reportId = buildReportId({
        runId: payload.value.runId,
        route: summary.route,
        networkType: payload.value.networkType,
        appVersion: payload.value.appVersion,
        uploaderOpenid: OPENID
      });
      const docData = buildDoc({
        reportId,
        runId: payload.value.runId,
        routeSummary: summary,
        appVersion: payload.value.appVersion,
        networkType: payload.value.networkType,
        device: payload.value.device,
        uploaderOpenid: OPENID
      });

      const existing = await collection
        .where({ reportId })
        .field({ _id: true })
        .limit(1)
        .get();

      if (existing.data && existing.data.length > 0) {
        await collection.doc(existing.data[0]._id).update({
          data: Object.assign({}, docData, {
            updatedAt: now
          })
        });
        updated += 1;
      } else {
        await collection.add({
          data: Object.assign({}, docData, {
            createdAt: now,
            updatedAt: now
          })
        });
        created += 1;
      }
    }

    return endTrace(trace, {
      success: true,
      data: {
        runId: payload.value.runId,
        total: payload.value.routeSummaries.length,
        created,
        updated
      }
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('[reportPerfMetrics] failed:', sanitizeError(err));
    return endTrace(trace, fail('internal error'));
  }
};

async function canUpload(openid) {
  const allowlist = parseOpenidList(process.env.PERF_REPORT_OPENIDS || '');
  if (allowlist.includes(openid)) {
    return true;
  }

  if (sharedAuth && typeof sharedAuth.assertAdmin === 'function') {
    return sharedAuth.assertAdmin({
      db,
      openid,
      contextName: 'report-perf-metrics'
    });
  }

  const userQuery = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();
  const user = userQuery.data && userQuery.data[0];
  if (!user) return false;
  return user.isAdmin === true || !!(user.permissions && user.permissions.canManageUsers === true);
}

function validatePayload(event) {
  const runId = toSafeText(event.runId, MAX_STR_LEN);
  const appVersion = toSafeText(event.appVersion, MAX_STR_LEN);
  const networkType = toSafeText(event.networkType, 20);
  const routeSummaries = Array.isArray(event.routeSummaries) ? event.routeSummaries : [];

  if (!runId) return { ok: false, error: 'missing runId' };
  if (!appVersion) return { ok: false, error: 'missing appVersion' };
  if (!networkType) return { ok: false, error: 'missing networkType' };
  if (!routeSummaries.length) return { ok: false, error: 'missing routeSummaries' };
  if (routeSummaries.length > MAX_SUMMARY_SIZE) {
    return { ok: false, error: 'routeSummaries too large' };
  }

  const normalized = [];
  for (let i = 0; i < routeSummaries.length; i += 1) {
    const row = routeSummaries[i] || {};
    const route = toSafeText(row.route, MAX_ROUTE_LENGTH);
    if (!route) {
      return { ok: false, error: `invalid route at index ${i}` };
    }
    normalized.push({
      route,
      sampleCount: boundedNumber(row.sampleCount),
      firstScreen: normalizeFirstScreen(row.firstScreen || {}),
      requests: normalizeRequests(row.requests || {}),
      payload: normalizePayload(row.payload || {}),
      setData: normalizeSetData(row.setData || {})
    });
  }

  return {
    ok: true,
    value: {
      runId,
      appVersion,
      networkType,
      device: normalizeDevice(event.device || {}),
      routeSummaries: normalized
    }
  };
}

function buildDoc({ reportId, runId, routeSummary, appVersion, networkType, device, uploaderOpenid }) {
  return {
    reportId,
    runId,
    route: routeSummary.route,
    appVersion,
    networkType,
    sampleCount: routeSummary.sampleCount,
    firstScreen: routeSummary.firstScreen,
    requests: routeSummary.requests,
    payload: routeSummary.payload,
    setData: routeSummary.setData,
    device,
    uploaderOpenid
  };
}

function buildReportId({ runId, route, networkType, appVersion, uploaderOpenid }) {
  const raw = [runId, route, networkType, appVersion, uploaderOpenid].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function normalizeFirstScreen(firstScreen) {
  return {
    p50: boundedNumber(firstScreen.p50),
    p95: boundedNumber(firstScreen.p95),
    max: boundedNumber(firstScreen.max),
    timeouts: boundedNumber(firstScreen.timeouts)
  };
}

function normalizeRequests(requests) {
  return {
    cloudCalls: boundedNumber(requests.cloudCalls),
    dbReads: boundedNumber(requests.dbReads),
    dbWrites: boundedNumber(requests.dbWrites),
    total: boundedNumber(requests.total)
  };
}

function normalizePayload(payload) {
  return {
    requestBytes: boundedNumber(payload.requestBytes),
    responseBytes: boundedNumber(payload.responseBytes),
    totalBytes: boundedNumber(payload.totalBytes)
  };
}

function normalizeSetData(setData) {
  return {
    count: boundedNumber(setData.count),
    bytes: boundedNumber(setData.bytes)
  };
}

function normalizeDevice(device) {
  return {
    brand: toSafeText(device.brand, 32),
    model: toSafeText(device.model, 64),
    platform: toSafeText(device.platform, 32),
    system: toSafeText(device.system, 32),
    version: toSafeText(device.version, 32)
  };
}

function boundedNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(Math.round(num), MAX_NUMBER);
}

function parseOpenidList(raw) {
  if (typeof raw !== 'string') return [];
  return Array.from(new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)));
}

function toSafeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function sanitizeError(err) {
  const text = err && err.message ? err.message : String(err || 'unknown');
  return text.slice(0, 200);
}

function fail(error) {
  return {
    success: false,
    error
  };
}
