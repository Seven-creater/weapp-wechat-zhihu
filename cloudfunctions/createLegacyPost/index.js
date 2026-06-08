const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const ALLOWED_TYPES = new Set(['community', 'case']);
const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const MAX_IMAGES = 9;

function fail(error) {
  return { success: false, error };
}

function validateString(value, options = {}) {
  const { name = 'value', required = false, max = 2000 } = options;
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

function normalizeImages(value) {
  if (!Array.isArray(value)) return { ok: false, error: 'images must be array' };
  const images = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_IMAGES);

  const invalid = images.find((item) => item.length > 1024 || !item.startsWith('cloud://'));
  if (invalid) return { ok: false, error: 'invalid image fileID' };
  return { ok: true, value: images };
}

function normalizeType(value) {
  const type = value === 'case' ? 'case' : 'community';
  if (!ALLOWED_TYPES.has(type)) return null;
  return type;
}

function normalizeLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeCommunity(value, userData) {
  const profile = userData && userData.profile ? userData.profile : {};
  const userInfo = userData && userData.userInfo ? userData.userInfo : {};
  const candidates = [
    value,
    profile.community,
    userData && userData.community,
    userInfo.community
  ];
  const community = candidates
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .find((item) => ALLOWED_COMMUNITIES.has(item));
  return community || '楠竹社区';
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail('unauthorized');

  const postType = normalizeType(event.postType);
  if (!postType) return fail('invalid postType');

  const titleCheck = validateString(event.title, {
    name: 'title',
    required: false,
    max: 20
  });
  if (!titleCheck.ok) return fail(titleCheck.error);

  const contentCheck = validateString(event.content, {
    name: 'content',
    required: false,
    max: 1000
  });
  if (!contentCheck.ok) return fail(contentCheck.error);

  const imagesCheck = normalizeImages(event.images);
  if (!imagesCheck.ok) return fail(imagesCheck.error);
  if (!contentCheck.value && imagesCheck.value.length === 0) {
    return fail('missing content or images');
  }

  const addressCheck = validateString(event.address || event.formattedAddress, {
    name: 'address',
    required: false,
    max: 120
  });
  if (!addressCheck.ok) return fail(addressCheck.error);

  try {
    const userResult = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        userInfo: true,
        userType: true,
        profile: true,
        community: true,
        nickName: true,
        avatarUrl: true
      })
      .limit(1)
      .get();
    const userData = (userResult.data && userResult.data[0]) || {};
    const userInfo = userData.userInfo || {};
    const location = normalizeLocation(event.location);

    const postData = {
      _openid: OPENID,
      title: titleCheck.value || undefined,
      content: contentCheck.value,
      images: imagesCheck.value,
      type: postType,
      community: normalizeCommunity(event.community, userData),
      stats: { view: 0, like: 0, comment: 0 },
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      userInfo: {
        nickName: userInfo.nickName || userData.nickName || '匿名用户',
        avatarUrl: userInfo.avatarUrl || userData.avatarUrl || '/images/zhi.png'
      },
      userType: userData.userType || 'resident'
    };

    if (location) {
      postData.location = new db.Geo.Point(location.longitude, location.latitude);
      postData.address = addressCheck.value;
      postData.formattedAddress = addressCheck.value;
    }

    const result = await db.collection('posts').add({ data: postData });
    return {
      success: true,
      postId: result._id
    };
  } catch (err) {
    console.error('[createLegacyPost] failed:', err && err.message ? err.message : err);
    return fail('create post failed');
  }
};
