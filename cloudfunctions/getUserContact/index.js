const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[getUserContact] shared auth unavailable');
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const targetId = toSafeString(event.targetId, 64);

  try {
    if (!OPENID) {
      return {
        success: false,
        error: 'unauthorized'
      };
    }
    if (!targetId) {
      return {
        success: false,
        error: 'missing targetId'
      };
    }

    const callerQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .field({ isAdmin: true, permissions: true })
      .limit(1)
      .get();

    const caller = (callerQuery.data && callerQuery.data[0]) || {};
    const permissions = caller.permissions || {};
    const canManageUsers = permissions.canManageUsers === true;
    const canViewUserContact = permissions.canViewUserContact === true;
    const localAdmin = caller.isAdmin === true || canManageUsers;
    let sharedAdmin = false;
    if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
      try {
        sharedAdmin = await sharedAuth.isAdmin({ db, openid: OPENID });
      } catch (err) {
        sharedAdmin = false;
      }
    }

    if (!localAdmin && !sharedAdmin && !canViewUserContact) {
      return {
        success: false,
        error: 'forbidden'
      };
    }

    const targetQuery = await db.collection('users')
      .where({ _openid: targetId })
      .field({
        phoneNumber: true,
        profile: true
      })
      .limit(1)
      .get();

    if (!Array.isArray(targetQuery.data) || targetQuery.data.length === 0) {
      return {
        success: false,
        error: 'target user not found'
      };
    }

    const targetUser = targetQuery.data[0];
    const profile = targetUser.profile || {};
    return {
      success: true,
      data: {
        phoneNumber: safeString(targetUser.phoneNumber, 32),
        wechat: safeString(profile.contactInfo, 128),
        email: safeString(profile.email, 128),
        organization: safeString(profile.organization, 128)
      }
    };
  } catch (err) {
    const message = err && err.message ? err.message : 'query failed';
    console.error('[getUserContact] failed:', message);
    return {
      success: false,
      error: message
    };
  }
};

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function safeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}
