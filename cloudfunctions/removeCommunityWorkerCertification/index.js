const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[removeCommunityWorkerCertification] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[removeCommunityWorkerCertification] shared validate unavailable');
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
  return ADMIN_OPENIDS.includes(openid);
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  const userOpenidCheck = validateString(event.userOpenid, {
    name: 'userOpenid',
    required: true,
    min: 8,
    max: 64
  });
  if (!userOpenidCheck.ok) {
    return {
      success: false,
      error: userOpenidCheck.error
    };
  }
  const userOpenid = userOpenidCheck.value;

  try {
    if (!(await isAdmin(adminOpenid))) {
      return {
        success: false,
        error: '权限不足，仅管理员可以移除社区工作者身份'
      };
    }

    const userQuery = await db.collection('users')
      .where({ _openid: userOpenid })
      .limit(1)
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userQuery.data[0];
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          userType: 'normal',
          badge: {
            color: '#6B7280',
            icon: '👤',
            text: '用户'
          },
          userTypeLabel: '普通用户',
          'profile.community': null,
          'profile.position': null,
          'profile.workId': null,
          'certificationApplication.status': 'removed',
          certificationTime: null,
          updateTime: db.serverDate()
        }
      });

    return {
      success: true,
      message: '已移除社区工作者身份'
    };
  } catch (err) {
    console.error('[removeCommunityWorkerCertification] failed:', err && err.message ? err.message : err);
    return {
      success: false,
      error: err && err.message ? err.message : '操作失败，请稍后重试'
    };
  }
};
