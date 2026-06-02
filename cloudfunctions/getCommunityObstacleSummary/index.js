const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const MAX_SUMMARY_ROWS = 500;
const PAGE_SIZE = 100;
const DEFAULT_POST_PAGE_SIZE = 20;
const MAX_POST_PAGE_SIZE = 30;
const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const COMMUNITY_CENTERS = {
  '楠竹社区': { latitude: 28.06862, longitude: 113.00689 },
  '和美社区': { latitude: 28.0678, longitude: 113.0082 }
};

exports.main = async (event = {}) => {
  try {
    const community = toSafeString(event.community, 32);
    if (!ALLOWED_COMMUNITIES.has(community)) {
      return fail('unsupported community');
    }

    const includePostRows = event.includePostRows === true;
    const postPage = toPositiveInt(event.postPage, 1);
    const postPageSize = clamp(toPositiveInt(event.postPageSize, DEFAULT_POST_PAGE_SIZE), 1, MAX_POST_PAGE_SIZE);
    if (includePostRows && event.postRowsOnly === true) {
      const postResult = await buildPostRowsOnly(community, postPage, postPageSize);
      return {
        success: true,
        community,
        ...postResult
      };
    }

    const summary = await buildCommunitySummary(community, {
      includePostRows,
      postPage,
      postPageSize
    });
    return {
      success: true,
      ...summary
    };
  } catch (err) {
    console.error('[getCommunityObstacleSummary] failed:', err && err.message ? err.message : err);
    return fail('query failed');
  }
};

async function buildPostRowsOnly(community, postPage, postPageSize) {
  const where = {
    type: 'issue',
    community
  };
  const countRes = await db.collection('posts').where(where).count();
  const total = Number(countRes && countRes.total) || 0;
  const postRows = total > 0 ? await fetchPostRows(where, postPage, postPageSize) : [];
  return {
    total,
    postRows,
    postPagination: {
      page: postPage,
      pageSize: postPageSize,
      hasMore: postPage * postPageSize < total
    }
  };
}

async function buildCommunitySummary(community, options = {}) {
  const where = {
    type: 'issue',
    community
  };
  const countRes = await db.collection('posts').where(where).count();
  const total = Number(countRes && countRes.total) || 0;
  const rows = total > 0 ? await fetchRows(where, Math.min(total, MAX_SUMMARY_ROWS)) : [];

  const points = [];
  const statusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    other: 0
  };
  const categoryCounts = {};
  let latestTime = null;

  rows.forEach((row) => {
    const statusKey = normalizeStatus(row.status);
    statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

    const category = toSafeString(row.recognizedCategory || row.categoryName || row.category, 32) || '未分类';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    const time = normalizeDate(row.updateTime || row.createTime);
    if (time && (!latestTime || time.getTime() > latestTime.getTime())) {
      latestTime = time;
    }

    const location = extractLocation(row);
    if (!location) return;
    points.push({
      postId: String(row._id || ''),
      latitude: location.latitude,
      longitude: location.longitude,
      title: normalizeSubtypeList(row.recognizedSubtypes, row.recognizedSubtype).join('、') ||
        toSafeString(row.title || row.content || '障碍信息', 40)
    });
  });

  const center = deriveCenter(points) || COMMUNITY_CENTERS[community];
  const result = {
    community,
    total,
    updatedAt: latestTime ? formatDateTime(latestTime) : '暂无更新',
    center,
    points: points.slice(0, 200),
    statusCounts,
    categoryCounts
  };

  if (options.includePostRows) {
    const postPage = toPositiveInt(options.postPage, 1);
    const postPageSize = clamp(toPositiveInt(options.postPageSize, DEFAULT_POST_PAGE_SIZE), 1, MAX_POST_PAGE_SIZE);
    const postRows = await fetchPostRows(where, postPage, postPageSize);
    result.postRows = postRows;
    result.postPagination = {
      page: postPage,
      pageSize: postPageSize,
      hasMore: postPage * postPageSize < total
    };
  }

  return result;
}

async function fetchRows(where, maxRows) {
  const rows = [];
  let skip = 0;
  while (rows.length < maxRows) {
    const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
    const res = await db.collection('posts')
      .where(where)
      .field({
        _id: true,
        title: true,
        content: true,
        location: true,
        status: true,
        category: true,
        categoryName: true,
        recognizedCategory: true,
        recognizedSubtype: true,
        recognizedSubtypes: true,
        createTime: true,
        updateTime: true
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
    const batch = Array.isArray(res.data) ? res.data : [];
    rows.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return rows;
}

async function fetchPostRows(where, page, pageSize) {
  const skip = (page - 1) * pageSize;
  const res = await db.collection('posts')
    .where(where)
    .field({
      _id: true,
      title: true,
      content: true,
      status: true,
      category: true,
      categoryName: true,
      recognizedCategory: true,
      recognizedSubtype: true,
      recognizedSubtypes: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  return (Array.isArray(res.data) ? res.data : []).map((row) => {
    const category = toSafeString(row.recognizedCategory || row.categoryName || row.category, 32) || '未分类';
    const subtype = toSafeString(row.recognizedSubtype, 40);
    const subtypes = normalizeSubtypeList(row.recognizedSubtypes, subtype);
    const subtypeText = subtypes.join('、');
    return {
      postId: String(row._id || ''),
      title: toSafeString(row.title || row.content || '障碍信息', 60),
      status: normalizeStatus(row.status),
      statusText: formatStatus(row.status),
      recognizedCategory: category,
      recognizedSubtype: subtype,
      recognizedSubtypes: subtypes,
      tag: subtypeText ? `${category} / ${subtypeText}` : category,
      createTime: formatMaybeDate(row.createTime)
    };
  }).filter((row) => row.postId);
}

function normalizeSubtypeList(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  source.concat(fallback ? [fallback] : []).forEach((item) => {
    const subtype = toSafeString(item, 40);
    if (!subtype || seen.has(subtype)) return;
    seen.add(subtype);
    result.push(subtype);
  });
  return result;
}

function extractLocation(row) {
  const location = row && row.location;
  if (!location) return null;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    const longitude = Number(location.coordinates[0]);
    const latitude = Number(location.coordinates[1]);
    if (isValidCoord(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (isValidCoord(latitude, longitude)) {
    return { latitude, longitude };
  }
  return null;
}

function deriveCenter(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const sum = points.reduce((acc, point) => ({
    latitude: acc.latitude + point.latitude,
    longitude: acc.longitude + point.longitude
  }), { latitude: 0, longitude: 0 });
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length
  };
}

function normalizeStatus(value) {
  const status = toSafeString(value, 32);
  if (['completed', 'done', 'resolved', '已完成'].includes(status)) return 'completed';
  if (['processing', 'in_progress', '处理中'].includes(status)) return 'processing';
  if (['pending', 'open', 'todo', '待处理'].includes(status)) return 'pending';
  return 'other';
}

function formatStatus(value) {
  const key = normalizeStatus(value);
  if (key === 'completed') return '已完成';
  if (key === 'processing') return '处理中';
  if (key === 'pending') return '待处理';
  return '其他';
}

function formatMaybeDate(value) {
  const date = normalizeDate(value);
  return date ? formatDateTime(date) : '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value.getTime === 'function') return value;
  return null;
}

function formatDateTime(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = chinaTime.getUTCFullYear();
  const m = pad2(chinaTime.getUTCMonth() + 1);
  const d = pad2(chinaTime.getUTCDate());
  const h = pad2(chinaTime.getUTCHours());
  const min = pad2(chinaTime.getUTCMinutes());
  return `${y}-${m}-${d} ${h}:${min}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidCoord(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return true;
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const intValue = Math.floor(number);
  return intValue > 0 ? intValue : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fail(error) {
  return {
    success: false,
    error
  };
}
