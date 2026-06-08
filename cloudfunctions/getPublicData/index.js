const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');
let startTrace = (name, extra = {}) => ({ functionName: name, startedAt: Date.now(), extra });
let endTrace = (trace, result) => result;
let failTrace = () => {};
let estimateJsonBytes = (value) => {
  try {
    return JSON.stringify(value || {}).length;
  } catch (err) {
    return 0;
  }
};
try {
  const metrics = require('../_shared/metrics');
  startTrace = metrics.startTrace || startTrace;
  endTrace = metrics.endTrace || endTrace;
  failTrace = metrics.failTrace || failTrace;
  estimateJsonBytes = metrics.estimateJsonBytes || estimateJsonBytes;
} catch (err) {
  console.warn('[getPublicData] shared metrics unavailable');
}

const ALLOWED_COLLECTIONS = new Set(['posts', 'solutions', 'actions']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_KEYWORD_LEN = 50;
const ALLOWED_ORDER_FIELDS = new Set(['createTime', 'updateTime']);
const ALLOWED_COMMUNITIES = new Set(['楠竹社区', '和美社区']);
const CATEGORY_MAP = {
  parking: '无障碍停车位',
  restroom: '无障碍卫生间',
  ramp: '无障碍坡道',
  elevator: '无障碍电梯',
  lift: '无障碍升降台',
  service: '无障碍服务台',
  passage: '无障碍通道',
  entrance: '无障碍出入口',
  door: '无障碍门',
  steps: '台阶',
  handrail: '扶手',
  tactile: '盲道',
  curb: '缘石坡道'
};

const CATEGORY_NAME_TO_ID = Object.keys(CATEGORY_MAP).reduce((acc, id) => {
  acc[CATEGORY_MAP[id]] = id;
  return acc;
}, {});

exports.main = async (event = {}) => {
  const trace = startTrace('getPublicData', {
    collection: String(event.collection || ''),
    hasDocId: !!event.docId
  });
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const collection = String(event.collection || '').trim();
    if (!collection) {
      return endTrace(trace, fail('missing collection'));
    }
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      return endTrace(trace, fail('unsupported collection'));
    }

    const fieldMode = event.fieldMode === 'list' ? 'list' : 'detail';
    const docId = toSafeString(event.docId, 64);
    if (docId) {
      const single = await getSingleDoc(collection, docId, openid, fieldMode);
      return endTrace(trace, single, {
        resultBytes: estimateJsonBytes(single)
      });
    }

    const page = toPositiveInt(event.page, 1);
    const pageSize = clamp(toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const orderBy = normalizeOrderBy(event.orderBy);
    const order = event.order === 'asc' ? 'asc' : 'desc';

    const where = buildWhere(collection, event, openid);
    let queryBuilder = db.collection(collection).where(where);
    const projection = buildProjection(collection, fieldMode);
    if (projection) {
      queryBuilder = queryBuilder.field(projection);
    }
    queryBuilder = queryBuilder.orderBy(orderBy, order);
    const raw = await queryBuilder.skip(skip).limit(pageSize + 1).get();
    const rows = Array.isArray(raw.data) ? raw.data : [];
    const hasMore = rows.length > pageSize;
    const docs = rows.slice(0, pageSize);

    const data = await convertCloudMedia(docs);

    return endTrace(trace, {
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        hasMore
      }
    }, {
      rows: Array.isArray(data) ? data.length : 0
    });
  } catch (err) {
    failTrace(trace, err);
    console.error('[getPublicData] failed:', err);
    return endTrace(trace, fail(err && err.message ? err.message : 'query failed'));
  }
};

function buildWhere(collection, event, openid) {
  const where = {};

  const type = toSafeString(event.type, 32);
  if (type) {
    where.type = type;
  }

  const status = event.status;
  if (Array.isArray(status) && status.length) {
    const safeStatuses = status.map((item) => toSafeString(item, 32)).filter(Boolean);
    if (safeStatuses.length) {
      where.status = _.in(safeStatuses);
    }
  } else {
    const statusValue = toSafeString(status, 32);
    if (statusValue) {
      where.status = statusValue;
    }
  }

  const category = toSafeString(event.category, 64);
  if (category) {
    const maybeName = CATEGORY_MAP[category];
    const maybeId = CATEGORY_NAME_TO_ID[category];
    const options = dedupeStrings([category, maybeName, maybeId]).map((value) => _.eq(value));
    if (options.length === 1) {
      where.category = options[0];
    } else if (options.length > 1) {
      where.category = _.or(options);
    }
  }

  const community = toSafeString(event.community, 32);
  if (community && collection === 'posts' && ALLOWED_COMMUNITIES.has(community)) {
    where.community = community;
  }

  const authorOpenids = Array.isArray(event.authorOpenids)
    ? dedupeStrings(event.authorOpenids.map((id) => toSafeString(id, 64))).slice(0, 50)
    : [];
  if (authorOpenids.length > 0) {
    where._openid = _.in(authorOpenids);
  }

  // "actions" only returns current user's records to avoid exposing private behavior.
  if (collection === 'actions') {
    where._openid = openid;
  }

  const near = event.near || {};
  const latitude = Number(near.latitude);
  const longitude = Number(near.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const maxDistance = clamp(toPositiveInt(near.maxDistance, 10000), 100, 50000);
    where.location = _.geoNear({
      geometry: new db.Geo.Point(longitude, latitude),
      maxDistance,
      minDistance: 0
    });
  }

  const keyword = toSafeString(event.keyword, MAX_KEYWORD_LEN);
  if (!keyword) {
    return where;
  }

  const escaped = escapeRegExp(keyword);
  const reg = db.RegExp({
    regexp: escaped,
    options: 'i'
  });
  const keywordConditions = buildKeywordConditions(collection, reg);
  if (!keywordConditions.length) {
    return where;
  }

  if (Object.keys(where).length === 0) {
    return keywordConditions.length === 1 ? keywordConditions[0] : _.or(keywordConditions);
  }
  if (keywordConditions.length === 1) {
    return _.and([where, keywordConditions[0]]);
  }
  return _.and([where, _.or(keywordConditions)]);
}

async function getSingleDoc(collection, docId, openid, fieldMode) {
  try {
    const where = { _id: docId };
    if (collection === 'actions') {
      where._openid = openid;
    }
    let queryBuilder = db.collection(collection).where(where);

    const projection = buildDetailProjection(collection, fieldMode);
    if (projection) {
      queryBuilder = queryBuilder.field(projection);
    }

    const result = await queryBuilder.limit(1).get();
    const doc = result && Array.isArray(result.data) ? result.data[0] : null;
    if (!doc) {
      return fail('document not found');
    }
    if (collection === 'actions' && doc._openid !== openid) {
      return fail('forbidden');
    }
    const [converted] = await convertCloudMedia([doc]);
    return {
      success: true,
      data: converted || null
    };
  } catch (err) {
    if (String(err && err.message || '').includes('does not exist')) {
      return fail('document not found');
    }
    throw err;
  }
}

function buildProjection(collection, fieldMode) {
  if (fieldMode !== 'list') return null;

  if (collection === 'posts') {
    return {
      _id: true,
      _openid: true,
      title: true,
      content: true,
      images: true,
      image: true,
      coverImg: true,
      imageUrl: true,
      location: true,
      address: true,
      formattedAddress: true,
      detailAddress: true,
      community: true,
      stats: true,
      userInfo: true,
      userType: true,
      type: true,
      status: true,
      urgency: true,
      category: true,
      categoryId: true,
      categoryName: true,
      recognizedCategory: true,
      recognizedSubtype: true,
      recognizedSubtypes: true,
      designProposalCount: true,
      createTime: true
    };
  }

  if (collection === 'solutions') {
    return {
      _id: true,
      _openid: true,
      title: true,
      description: true,
      images: true,
      image: true,
      imageUrl: true,
      coverImg: true,
      coverImage: true,
      beforeImg: true,
      afterImg: true,
      community: true,
      stats: true,
      userInfo: true,
      userType: true,
      category: true,
      status: true,
      createTime: true
    };
  }

  if (collection === 'actions') {
    return {
      _id: true,
      _openid: true,
      targetId: true,
      postId: true,
      type: true,
      targetCollection: true,
      targetRoute: true,
      title: true,
      image: true,
      coverImg: true,
      createTime: true
    };
  }

  return null;
}

function buildDetailProjection(collection) {
  if (collection === 'posts') {
    return {
      _id: true,
      _openid: true,
      title: true,
      content: true,
      images: true,
      image: true,
      coverImg: true,
      imageUrl: true,
      location: true,
      address: true,
      formattedAddress: true,
      detailAddress: true,
      community: true,
      stats: true,
      userInfo: true,
      userType: true,
      type: true,
      status: true,
      urgency: true,
      category: true,
      categoryId: true,
      categoryName: true,
      designProposalCount: true,
      aiSolution: true,
      aiDiagnosis: true,
      recognizedCategory: true,
      recognizedSubtype: true,
      recognizedSubtypes: true,
      recognitionConfidence: true,
      rampProblems: true,
      hasScheme: true,
      schemeMessage: true,
      schemeSource: true,
      matchedSchemes: true,
      createTime: true,
      updateTime: true
    };
  }

  if (collection === 'solutions') {
    return {
      _id: true,
      _openid: true,
      title: true,
      description: true,
      images: true,
      image: true,
      imageUrl: true,
      coverImg: true,
      coverImage: true,
      beforeImg: true,
      afterImg: true,
      community: true,
      stats: true,
      userInfo: true,
      userType: true,
      category: true,
      status: true,
      createTime: true,
      updateTime: true
    };
  }

  if (collection === 'actions') {
    return {
      _id: true,
      _openid: true,
      targetId: true,
      postId: true,
      type: true,
      targetCollection: true,
      targetRoute: true,
      title: true,
      image: true,
      coverImg: true,
      createTime: true
    };
  }

  return null;
}

async function convertCloudMedia(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const cloudIds = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    media.collectCloudFileIdsDeep({
      images: item.images,
      image: item.image,
      imageUrl: item.imageUrl,
      coverImage: item.coverImage,
      coverImg: item.coverImg,
      beforeImg: item.beforeImg,
      afterImg: item.afterImg,
      contractorAvatar: item.contractorAvatar,
      userInfo: item.userInfo && item.userInfo.avatarUrl ? { avatarUrl: item.userInfo.avatarUrl } : null,
      photos: item.photos,
      stages: Array.isArray(item.stages)
        ? item.stages.map((stage) => ({ photos: stage && stage.photos, images: stage && stage.images }))
        : [],
      milestones: Array.isArray(item.milestones)
        ? item.milestones.map((milestone) => ({ photos: milestone && milestone.photos, images: milestone && milestone.images }))
        : []
    }, cloudIds, {
      maxScan: 220,
      maxDepth: 6
    });
  }

  if (cloudIds.size === 0) {
    return items;
  }

  const mapping = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getPublicData'
  });
  return items.map((item) => media.replaceCloudUrlsDeep(item, mapping, { maxDepth: 6 }));
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLen);
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
}

function normalizeOrderBy(value) {
  const orderBy = toSafeString(value, 32) || 'createTime';
  return ALLOWED_ORDER_FIELDS.has(orderBy) ? orderBy : 'createTime';
}

function dedupeStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordConditions(collection, reg) {
  if (collection === 'posts') {
    return ['title', 'content', 'address', 'formattedAddress', 'detailAddress', 'community']
      .map((field) => ({ [field]: reg }));
  }

  if (collection === 'solutions') {
    return ['title', 'description', 'address', 'formattedAddress', 'detailAddress', 'community']
      .map((field) => ({ [field]: reg }));
  }

  return [{ title: reg }];
}

function fail(error) {
  return {
    success: false,
    error
  };
}
