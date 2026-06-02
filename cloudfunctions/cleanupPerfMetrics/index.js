const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const COLLECTION = 'perf_page_metrics';
const BATCH_SIZE = 100;
const DEFAULT_RETENTION_DAYS = 90;

let sharedAuth = null;
let startTrace = (name) => ({ name, startedAt: Date.now() });
let endTrace = (trace, result) => result;
let failTrace = () => {};
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[cleanupPerfMetrics] shared auth unavailable');
}
try {
  const metrics = require('../_shared/metrics');
  startTrace = metrics.startTrace || startTrace;
  endTrace = metrics.endTrace || endTrace;
  failTrace = metrics.failTrace || failTrace;
} catch (err) {
  console.warn('[cleanupPerfMetrics] shared metrics unavailable');
}

exports.main = async (event = {}) => {
  const trace = startTrace('cleanupPerfMetrics');
  const { OPENID } = cloud.getWXContext();

  try {
    if (!OPENID) {
      return endTrace(trace, fail('unauthorized'));
    }

    const isAdmin = await assertAdmin(OPENID);
    if (!isAdmin) {
      return endTrace(trace, fail('forbidden'));
    }

    const retentionDays = normalizeRetention(event.retentionDays);
    const dryRun = !!event.dryRun;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const query = db.collection(COLLECTION).where({
      createdAt: _.lt(cutoffDate)
    });

    const countRes = await query.count();
    const totalMatched = countRes.total || 0;
    if (dryRun) {
      return endTrace(trace, {
        success: true,
        data: {
          dryRun: true,
          retentionDays,
          cutoffAt: cutoffDate.toISOString(),
          totalMatched,
          deletedCount: 0
        }
      });
    }

    let deletedCount = 0;
    let rounds = 0;
    while (true) {
      rounds += 1;
      const page = await db.collection(COLLECTION)
        .where({ createdAt: _.lt(cutoffDate) })
        .field({ _id: true })
        .limit(BATCH_SIZE)
        .get();
      const docs = page.data || [];
      if (!docs.length) break;

      await Promise.all(docs.map((doc) => {
        return db.collection(COLLECTION).doc(doc._id).remove();
      }));
      deletedCount += docs.length;
      if (docs.length < BATCH_SIZE) break;
      if (rounds >= 500) break;
    }

    return endTrace(trace, {
      success: true,
      data: {
        dryRun: false,
        retentionDays,
        cutoffAt: cutoffDate.toISOString(),
        totalMatched,
        deletedCount,
        rounds
      }
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('[cleanupPerfMetrics] failed:', sanitizeError(err));
    return endTrace(trace, fail('internal error'));
  }
};

async function assertAdmin(openid) {
  if (sharedAuth && typeof sharedAuth.assertAdmin === 'function') {
    return sharedAuth.assertAdmin({
      db,
      openid,
      contextName: 'cleanup-perf-metrics'
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

function normalizeRetention(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  const rounded = Math.round(n);
  if (rounded < 7) return 7;
  if (rounded > 3650) return 3650;
  return rounded;
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
