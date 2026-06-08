const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const facilityId = toSafeString(event.facilityId || event.id, 64);
  if (!facilityId) return { success: false, error: 'missing facilityId' };

  try {
    const res = await db.collection('facilities')
      .where({ _id: facilityId })
      .field({
        name: true,
        facilityType: true,
        status: true,
        address: true,
        formattedAddress: true,
        location: true,
        longitude: true,
        latitude: true,
        images: true,
        description: true,
        statusHistory: true,
        createTime: true,
        updateTime: true,
        _openid: true
      })
      .limit(1)
      .get();

    const facility = res.data && res.data[0] ? res.data[0] : null;
    if (!facility) return { success: false, error: 'facility not found' };

    const canUpdate = await canUpdateFacility(OPENID, facility);
    return {
      success: true,
      data: {
        facility,
        canUpdate
      }
    };
  } catch (err) {
    console.error('[getFacilityDetail] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

async function canUpdateFacility(openid, facility) {
  if (!openid) return false;
  if (facility && facility._openid === openid) return true;
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .field({ userType: true })
    .limit(1)
    .get();
  const user = userRes.data && userRes.data[0];
  return !!(user && user.userType === 'communityWorker');
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
