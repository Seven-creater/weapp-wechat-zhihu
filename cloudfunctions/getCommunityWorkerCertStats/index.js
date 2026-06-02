const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[getCommunityWorkerCertStats] shared auth unavailable');
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

  try {
    if (!(await isAdmin(wxContext.OPENID))) {
      return {
        success: false,
        error: '权限不足，仅管理员可查看统计数据',
        stats: {
          pending: 0,
          approved: 0,
          rejected: 0
        }
      };
    }

    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      db.collection('users').where({
        'certificationApplication.status': 'pending',
        'certificationApplication.type': 'communityWorker'
      }).count(),
      db.collection('users').where({
        'certificationApplication.status': 'approved',
        'certificationApplication.type': 'communityWorker'
      }).count(),
      db.collection('users').where({
        'certificationApplication.status': 'rejected',
        'certificationApplication.type': 'communityWorker'
      }).count()
    ]);

    return {
      success: true,
      stats: {
        pending: pendingCount.total,
        approved: approvedCount.total,
        rejected: rejectedCount.total
      }
    };
  } catch (err) {
    console.error('[getCommunityWorkerCertStats] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : '获取失败',
      stats: {
        pending: 0,
        approved: 0,
        rejected: 0
      }
    };
  }
};
