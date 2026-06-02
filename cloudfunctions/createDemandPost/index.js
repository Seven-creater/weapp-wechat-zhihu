const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[createDemandPost] shared validate unavailable');
}

const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const ALLOWED_URGENCY = new Set(['high', 'medium', 'low']);
const PHONE_REG = /^[0-9+\-\s()]{6,32}$/;
const MAX_IMAGES = 5;

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  const { name = 'value', required = false, min = 0, max = 2000 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length < min) return { ok: false, error: `${name} too short` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return { ok: false, error: 'images must be array' };
  const images = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
  if (images.length === 0) return { ok: false, error: 'missing images' };
  const tooLong = images.find((item) => item.length > 1024);
  if (tooLong) return { ok: false, error: 'image url too long' };
  return { ok: true, value: images };
}

function normalizeLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const titleCheck = validateString(event.title, {
    name: 'title',
    required: true,
    min: 2,
    max: 30
  });
  if (!titleCheck.ok) return fail(titleCheck.error);

  const contentCheck = validateString(event.content, {
    name: 'content',
    required: true,
    min: 2,
    max: 300
  });
  if (!contentCheck.ok) return fail(contentCheck.error);

  const communityCheck = validateString(event.community, {
    name: 'community',
    required: true,
    max: 32
  });
  if (!communityCheck.ok || !ALLOWED_COMMUNITIES.has(communityCheck.value)) {
    return fail('invalid community');
  }

  const urgencyCheck = validateString(event.urgency, {
    name: 'urgency',
    required: true,
    max: 16
  });
  if (!urgencyCheck.ok || !ALLOWED_URGENCY.has(urgencyCheck.value)) {
    return fail('invalid urgency');
  }

  const imagesCheck = normalizeImages(event.images);
  if (!imagesCheck.ok) return fail(imagesCheck.error);

  const location = normalizeLocation(event.location);
  if (!location) return fail('invalid location');

  const addressCheck = validateString(event.address, {
    name: 'address',
    required: false,
    max: 120
  });
  if (!addressCheck.ok) return fail(addressCheck.error);

  const formattedAddressCheck = validateString(event.formattedAddress, {
    name: 'formattedAddress',
    required: false,
    max: 120
  });
  if (!formattedAddressCheck.ok) return fail(formattedAddressCheck.error);

  const detailAddressCheck = validateString(event.detailAddress, {
    name: 'detailAddress',
    required: false,
    max: 120
  });
  if (!detailAddressCheck.ok) return fail(detailAddressCheck.error);

  const contactPhoneCheck = validateString(event.contactPhone, {
    name: 'contactPhone',
    required: false,
    max: 32
  });
  if (!contactPhoneCheck.ok) return fail(contactPhoneCheck.error);
  if (contactPhoneCheck.value && !PHONE_REG.test(contactPhoneCheck.value)) {
    return fail('invalid contactPhone');
  }

  try {
    const userResult = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        userInfo: true,
        userType: true,
        nickName: true,
        avatarUrl: true
      })
      .limit(1)
      .get();
    const userData = (userResult.data && userResult.data[0]) || {};
    const userInfo = userData.userInfo || {};

    const postData = {
      _openid: OPENID,
      type: 'demand',
      status: 'pending',
      title: titleCheck.value,
      content: contentCheck.value,
      images: imagesCheck.value,
      community: communityCheck.value,
      urgency: urgencyCheck.value,
      location: new db.Geo.Point(location.longitude, location.latitude),
      address: addressCheck.value,
      formattedAddress: formattedAddressCheck.value,
      detailAddress: detailAddressCheck.value,
      contactPhone: contactPhoneCheck.value,
      category: 'demand',
      categoryId: 'demand',
      categoryName: '改造需求',
      designProposalCount: 0,
      stats: {
        like: 0,
        comment: 0,
        collect: 0,
        view: 0
      },
      userInfo: {
        nickName: userInfo.nickName || userData.nickName || '微信用户',
        avatarUrl: userInfo.avatarUrl || userData.avatarUrl || '/images/zhi.png'
      },
      userType: userData.userType || 'resident',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('posts').add({ data: postData });
    return {
      success: true,
      postId: result._id
    };
  } catch (err) {
    console.error('[createDemandPost] failed:', err && err.message ? err.message : err);
    return fail('create demand failed');
  }
};

function fail(message) {
  return {
    success: false,
    error: message
  };
}
