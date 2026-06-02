const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[getUserInfoAdmin] shared auth unavailable');
}

const SUPER_ADMIN_OPENIDS = String(process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const targetOpenid = toSafeString(event.targetOpenid, 64) || OPENID;

  try {
    if (!OPENID) {
      return {
        success: false,
        error: 'unauthorized'
      };
    }

    const canAccess = await checkAdminAccess(OPENID);
    if (!canAccess) {
      return {
        success: false,
        error: 'forbidden'
      };
    }

    const userQuery = await db.collection('users')
      .where({ _openid: targetOpenid })
      .field({
        _id: true,
        _openid: true,
        userInfo: true,
        userType: true,
        badge: true,
        profile: true,
        stats: true,
        permissions: true,
        isAdmin: true,
        phoneNumber: true,
        createTime: true,
        updateTime: true
      })
      .limit(1)
      .get();

    if (!Array.isArray(userQuery.data) || userQuery.data.length === 0) {
      return {
        success: false,
        error: 'user not found'
      };
    }

    return {
      success: true,
      data: userQuery.data[0]
    };
  } catch (err) {
    const message = err && err.message ? err.message : 'query failed';
    if (message === 'forbidden') {
      return {
        success: false,
        error: 'forbidden'
      };
    }
    console.error('[getUserInfoAdmin] failed:', message);
    return {
      success: false,
      error: message
    };
  }
};

async function checkAdminAccess(openid) {
  if (!openid) return false;
  if (sharedAuth && typeof sharedAuth.assertAdmin === 'function') {
    try {
      await sharedAuth.assertAdmin({ db, openid, contextName: 'getUserInfoAdmin' });
      return true;
    } catch (err) {
      return false;
    }
  }

  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    return true;
  }

  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();
  const user = (res.data && res.data[0]) || {};
  return !!(
    user.isAdmin === true ||
    (user.permissions && user.permissions.canManageUsers === true)
  );
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
