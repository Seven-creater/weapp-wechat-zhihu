const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const VALID_TYPES = new Set(['designer', 'contractor', 'communityWorker']);

function fail(error) {
  return { success: false, error: toFriendlyError(error) };
}

function toFriendlyError(error) {
  if (error === 'unauthorized') return '请先登录';
  if (error === 'invalid userType') return '无效的用户类型';
  if (error === 'invalid certificationInfo') return '参数错误';
  if (error === 'user not found') return '用户不存在，请先完成注册';
  if (error === 'pending application exists') return '您已有待审核的申请，请等待审核结果';
  if (error === 'submit certification failed') return '提交失败，请稍后重试';
  if (typeof error === 'string' && error.startsWith('missing ')) return '请填写完整的认证信息';
  if (typeof error === 'string' && error.endsWith(' must be string')) return '认证信息格式错误';
  if (typeof error === 'string' && error.endsWith(' too long')) return '认证信息过长';
  return error || '提交失败，请稍后重试';
}

function safeString(value, options = {}) {
  const { name = 'value', required = false, max = 80 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

function normalizeInfo(userType, rawInfo) {
  if (!rawInfo || typeof rawInfo !== 'object' || Array.isArray(rawInfo)) {
    return { ok: false, error: 'invalid certificationInfo' };
  }

  if (userType === 'communityWorker') {
    return pickRequired(rawInfo, [
      ['community', 32],
      ['position', 40],
      ['workId', 40]
    ]);
  }

  if (userType === 'designer') {
    return pickRequired(rawInfo, [
      ['organization', 80],
      ['title', 40],
      ['expertise', 160]
    ]);
  }

  if (userType === 'contractor') {
    const base = pickRequired(rawInfo, [
      ['companyName', 80],
      ['contactPerson', 40],
      ['serviceArea', 120],
      ['specialties', 160]
    ]);
    if (!base.ok) return base;
    const contactPhone = safeString(rawInfo.contactPhone, {
      name: 'contactPhone',
      required: false,
      max: 32
    });
    if (!contactPhone.ok) return contactPhone;
    if (contactPhone.value) base.value.contactPhone = contactPhone.value;
    return base;
  }

  return { ok: false, error: 'invalid userType' };
}

function pickRequired(source, fields) {
  const value = {};
  for (const [field, max] of fields) {
    const check = safeString(source[field], {
      name: field,
      required: true,
      max
    });
    if (!check.ok) return check;
    value[field] = check.value;
  }
  return { ok: true, value };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail('unauthorized');

  try {
    const userType = typeof event.userType === 'string' ? event.userType.trim() : '';
    if (!VALID_TYPES.has(userType)) {
      return fail('invalid userType');
    }

    const infoCheck = normalizeInfo(userType, event.certificationInfo);
    if (!infoCheck.ok) return fail(infoCheck.error);
    const certificationInfo = infoCheck.value;

    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        certificationApplication: true
      })
      .limit(1)
      .get();

    if (!userQuery.data || userQuery.data.length === 0) {
      return fail('user not found');
    }

    const user = userQuery.data[0];
    if (user.certificationApplication && user.certificationApplication.status === 'pending') {
      return fail('pending application exists');
    }

    const application = {
      type: userType,
      info: certificationInfo,
      status: 'pending',
      applyTime: Date.now(),
      reviewTime: null,
      reviewerId: null,
      rejectReason: null
    };

    if (userType === 'communityWorker') {
      application.community = certificationInfo.community;
      application.position = certificationInfo.position;
      application.workId = certificationInfo.workId;
    }

    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          certificationApplication: application,
          updateTime: db.serverDate()
        }
      });

    console.log('[applyCertification] submitted:', userType, OPENID);
    return {
      success: true,
      message: '认证申请已提交，请等待审核'
    };
  } catch (err) {
    console.error('[applyCertification] failed:', err && err.message ? err.message : err);
    return fail('submit certification failed');
  }
};
