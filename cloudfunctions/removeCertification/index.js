const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[removeCertification] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[removeCertification] shared validate unavailable');
}

const ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

async function isAdmin(openid) {
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  if (ADMIN_OPENIDS.includes(openid)) {
    return true;
  }
  return false;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  const targetCheck = validateString(event.targetOpenid, {
    name: 'targetOpenid',
    required: true,
    min: 8,
    max: 64
  });
  if (!targetCheck.ok) {
    return {
      success: false,
      error: targetCheck.error
    };
  }
  const targetOpenid = targetCheck.value;

  try {
    if (!(await isAdmin(adminOpenid))) {
      return {
        success: false,
        error: '权限不足，仅管理员可以移除认证身份'
      };
    }

    const userRes = await db.collection('users')
      .where({ _openid: targetOpenid })
      .limit(1)
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userRes.data[0];
    const currentUserType = user.userType;
    if (!currentUserType || currentUserType === 'resident' || currentUserType === 'normal') {
      return {
        success: false,
        error: '该用户没有认证身份'
      };
    }

    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          userType: 'resident',
          badge: _.remove(),
          userTypeLabel: _.remove(),
          certificationTime: _.remove(),
          certificationApplication: _.remove(),
          'profile.community': _.remove(),
          'profile.position': _.remove(),
          'profile.workId': _.remove(),
          'profile.organization': _.remove(),
          'profile.title': _.remove(),
          'profile.expertise': _.remove(),
          'profile.companyName': _.remove(),
          'profile.contactPerson': _.remove(),
          'profile.serviceArea': _.remove(),
          'profile.specialties': _.remove(),
          'profile.certificationStatus': _.remove(),
          updateTime: db.serverDate()
        }
      });

    return {
      success: true,
      message: '认证身份已移除',
      removedType: currentUserType
    };
  } catch (err) {
    console.error('[removeCertification] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : '移除失败，请稍后重试'
    };
  }
};
