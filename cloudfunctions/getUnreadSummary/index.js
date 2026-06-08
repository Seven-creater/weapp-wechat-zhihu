const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const PAGE_SIZE = 100;
const MAX_SCAN_ROWS = 1000;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  try {
    let totalUnread = 0;
    let scanned = 0;

    while (scanned < MAX_SCAN_ROWS) {
      const res = await db.collection('conversations')
        .where({ ownerId: OPENID })
        .field({ unreadCount: true })
        .skip(scanned)
        .limit(PAGE_SIZE)
        .get();

      const rows = Array.isArray(res.data) ? res.data : [];
      rows.forEach((row) => {
        totalUnread += Number(row.unreadCount || 0);
      });

      scanned += rows.length;
      if (rows.length < PAGE_SIZE) break;
    }

    return {
      success: true,
      totalUnread,
      truncated: scanned >= MAX_SCAN_ROWS
    };
  } catch (err) {
    console.error('[getUnreadSummary] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};
