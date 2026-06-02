const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

exports.main = async (event = {}) => {
  try {
    const facilityId = toSafeString(event.facilityId, 64);
    if (facilityId) {
      return getById(facilityId);
    }

    return queryList(event);
  } catch (err) {
    console.error('[getFacilities] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'query failed'
    };
  }
};

async function getById(facilityId) {
  try {
    const res = await db.collection('facilities').doc(facilityId).get();
    if (!res || !res.data) {
      return {
        success: false,
        error: 'facility not found'
      };
    }

    return {
      success: true,
      data: [res.data],
      total: 1,
      page: 1,
      pageSize: 1,
      hasMore: false
    };
  } catch (err) {
    if (String(err && err.message || '').includes('does not exist')) {
      return {
        success: false,
        error: 'facility not found'
      };
    }
    throw err;
  }
}

async function queryList(event) {
  const page = toPositiveInt(event.page, 1);
  const pageSize = clamp(toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const includeTotal = event.includeTotal !== false;
  const skip = (page - 1) * pageSize;

  const query = buildWhere(event);
  let queryBuilder = db.collection('facilities').where(query);

  const hasGeo = isFiniteNumber(event.latitude) && isFiniteNumber(event.longitude);
  if (!hasGeo) {
    queryBuilder = queryBuilder.orderBy('createTime', 'desc');
  }

  const result = await queryBuilder.skip(skip).limit(pageSize + 1).get();
  const rows = Array.isArray(result.data) ? result.data : [];
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);

  let total = null;
  if (includeTotal) {
    const countResult = await db.collection('facilities').where(query).count();
    total = countResult.total || 0;
  } else {
    total = skip + data.length + (hasMore ? 1 : 0);
  }

  return {
    success: true,
    data,
    total,
    page,
    pageSize,
    hasMore
  };
}

function buildWhere(event) {
  const query = {};

  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const radius = clamp(toPositiveInt(event.radius, 5000), 100, 50000);
    query.location = _.geoNear({
      geometry: new db.Geo.Point(longitude, latitude),
      maxDistance: radius,
      minDistance: 0
    });
  }

  const facilityType = toSafeString(event.facilityType, 64);
  if (facilityType) {
    query.facilityType = facilityType;
  }

  const status = event.status;
  if (Array.isArray(status) && status.length > 0) {
    const safeStatus = status.map((item) => toSafeString(item, 32)).filter(Boolean);
    if (safeStatus.length > 0) {
      query.status = _.in(safeStatus);
    }
  } else {
    const oneStatus = toSafeString(status, 32);
    if (oneStatus) {
      query.status = oneStatus;
    }
  }

  return query;
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
