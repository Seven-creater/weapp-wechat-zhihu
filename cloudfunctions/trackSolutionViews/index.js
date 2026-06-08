const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const MAX_IDS = 20;

function fail(error) {
  return { success: false, error };
}

function normalizeIds(event = {}) {
  const raw = Array.isArray(event.ids) ? event.ids : [event.id];
  return Array.from(new Set(
    raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item && item.length <= 64)
  )).slice(0, MAX_IDS);
}

function getDateKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail('unauthorized');

  const ids = normalizeIds(event);
  if (ids.length === 0) return fail('missing ids');

  const dateKey = getDateKey();

  try {
    const existingRes = await db.collection('solutions')
      .where({ _id: _.in(ids) })
      .field({ _id: true })
      .limit(ids.length)
      .get();
    const existingIds = new Set((existingRes.data || []).map((item) => item._id));
    const validIds = ids.filter((id) => existingIds.has(id));
    if (validIds.length === 0) {
      return { success: true, viewedIds: [], skippedIds: ids };
    }

    const viewedRes = await db.collection('solution_view_logs')
      .where({
        _openid: OPENID,
        targetId: _.in(validIds),
        dateKey
      })
      .field({ targetId: true })
      .limit(validIds.length)
      .get();
    const viewedSet = new Set((viewedRes.data || []).map((item) => item.targetId));
    const toIncrement = validIds.filter((id) => !viewedSet.has(id));

    await Promise.all(toIncrement.map((id) => {
      return db.collection('solution_view_logs').add({
        data: {
          _openid: OPENID,
          targetId: id,
          dateKey,
          createTime: db.serverDate()
        }
      }).then(() => db.collection('solutions').doc(id).update({
        data: {
          viewCount: _.inc(1),
          'stats.view': _.inc(1),
          updateTime: db.serverDate()
        }
      }));
    }));

    return {
      success: true,
      viewedIds: toIncrement,
      skippedIds: validIds.filter((id) => viewedSet.has(id))
    };
  } catch (err) {
    console.error('[trackSolutionViews] failed:', err && err.message ? err.message : err);
    return fail('track failed');
  }
};
