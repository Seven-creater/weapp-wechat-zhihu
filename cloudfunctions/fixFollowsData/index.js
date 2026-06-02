const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[fixFollowsData] shared auth unavailable');
}

const ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function isAdmin(openid) {
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  return ADMIN_OPENIDS.includes(openid);
}

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  try {
    if (!(await isAdmin(adminOpenid))) {
      return {
        success: false,
        error: '权限不足，仅管理员可执行数据修复'
      };
    }

    const allFollows = await db.collection('follows').limit(1000).get();

    let fixedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;

    for (const follow of allFollows.data || []) {
      const hasNewFields = follow._openid && follow.targetId;
      const hasOldFields = follow.followerId && follow.followingId;

      if (hasNewFields) {
        skippedCount++;
        continue;
      }

      if (hasOldFields) {
        try {
          await db.collection('follows').doc(follow._id).remove();
          await db.collection('follows').add({
            data: {
              _openid: follow.followerId,
              targetId: follow.followingId,
              createTime: follow.createTime || db.serverDate(),
              isMutual: !!follow.isMutual
            }
          });
          fixedCount++;
        } catch (err) {
          console.error('[fixFollowsData] migrate one failed:', err && err.message ? err.message : err);
        }
      } else {
        try {
          await db.collection('follows').doc(follow._id).remove();
          deletedCount++;
        } catch (err) {
          console.error('[fixFollowsData] remove broken one failed:', err && err.message ? err.message : err);
        }
      }
    }

    return {
      success: true,
      message: '数据修复完成',
      stats: {
        total: (allFollows.data || []).length,
        fixed: fixedCount,
        deleted: deletedCount,
        skipped: skippedCount
      }
    };
  } catch (err) {
    console.error('[fixFollowsData] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : '数据修复失败'
    };
  }
};
