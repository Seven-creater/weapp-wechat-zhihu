const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_TARGET_ID_LEN = 64;
const ACTION_TYPES = {
  like: ['like_post', 'like_solution', 'like'],
  collect: ['collect_post', 'collect_solution', 'collect'],
  all: ['like_post', 'like_solution', 'like', 'collect_post', 'collect_solution', 'collect']
};

exports.main = async (event = {}) => {
  try {
    const targetId = toSafeString(event.targetId, MAX_TARGET_ID_LEN);
    if (!targetId) return fail('missing targetId');

    const type = ACTION_TYPES[event.type] ? event.type : 'all';
    const page = toPositiveInt(event.page, DEFAULT_PAGE);
    const pageSize = clamp(toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const where = {
      _openid: targetId,
      type: _.in(ACTION_TYPES[type])
    };

    const actionRes = await db.collection('actions')
      .where(where)
      .field({
        _id: true,
        type: true,
        targetId: true,
        postId: true,
        targetCollection: true,
        createTime: true
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize + 1)
      .get();

    const rows = Array.isArray(actionRes.data) ? actionRes.data : [];
    const hasMore = rows.length > pageSize;
    const actions = rows.slice(0, pageSize);

    const grouped = groupTargetIds(actions);
    const [postDocs, solutionDocs] = await Promise.all([
      fetchDocs('posts', grouped.posts),
      fetchDocs('solutions', grouped.solutions)
    ]);

    const postMap = new Map(postDocs.map((item) => [item._id, item]));
    const solutionMap = new Map(solutionDocs.map((item) => [item._id, item]));

    const cards = actions
      .map((action) => {
        const target = readTarget(action);
        if (!target.id) return null;
        const doc = target.collection === 'solutions'
          ? solutionMap.get(target.id)
          : postMap.get(target.id);
        if (!doc) return null;
        return buildCard(doc, target.collection, action.createTime);
      })
      .filter(Boolean);

    await resolveCardImages(cards);

    return {
      success: true,
      data: cards,
      pagination: {
        page,
        pageSize,
        hasMore
      }
    };
  } catch (err) {
    console.error('[getUserActions] failed:', safeMessage(err));
    return fail('query failed');
  }
};

function groupTargetIds(actions) {
  const output = { posts: [], solutions: [] };
  const seen = { posts: new Set(), solutions: new Set() };
  (actions || []).forEach((action) => {
    const target = readTarget(action);
    if (!target.id || seen[target.collection].has(target.id)) return;
    seen[target.collection].add(target.id);
    output[target.collection].push(target.id);
  });
  return output;
}

function readTarget(action = {}) {
  const id = toSafeString(action.targetId || action.postId, MAX_TARGET_ID_LEN);
  const actionType = String(action.type || '');
  const collection = action.targetCollection === 'solutions' || actionType.indexOf('solution') > -1
    ? 'solutions'
    : 'posts';
  return { id, collection };
}

async function fetchDocs(collection, ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean))).slice(0, MAX_PAGE_SIZE);
  if (uniqueIds.length === 0) return [];

  return db.collection(collection)
    .where({ _id: _.in(uniqueIds) })
    .field({
      _id: true,
      title: true,
      description: true,
      content: true,
      images: true,
      image: true,
      coverImg: true,
      coverImage: true,
      beforeImg: true,
      afterImg: true,
      imageUrl: true,
      stats: true,
      category: true,
      categoryName: true,
      recognizedCategory: true,
      recognizedSubtype: true,
      recognizedSubtypes: true,
      createTime: true
    })
    .limit(uniqueIds.length)
    .get()
    .then((res) => Array.isArray(res.data) ? res.data : []);
}

function buildCard(doc, collection, actionCreateTime) {
  const image = media.pickImageFromDoc(doc);
  const stats = doc.stats || {};
  return {
    id: doc._id,
    title: normalizeTitle(doc.title || doc.description || doc.content),
    image: image || '/images/24213.jpg',
    hasImage: !!image,
    tag: formatTag(doc),
    likes: typeof stats.like === 'number' ? stats.like : 0,
    route: collection === 'solutions' ? '/pages/solution-detail/index' : '/pages/post-detail/index',
    collection,
    createTime: actionCreateTime || doc.createTime || null
  };
}

function formatTag(doc) {
  const subtypeText = Array.isArray(doc.recognizedSubtypes) && doc.recognizedSubtypes.length
    ? doc.recognizedSubtypes.join('、')
    : toSafeString(doc.recognizedSubtype, 80);
  if (doc.recognizedCategory && subtypeText) {
    return `${doc.recognizedCategory} / ${subtypeText}`;
  }
  return toSafeString(doc.recognizedCategory || doc.categoryName || doc.category, 80);
}

async function resolveCardImages(cards) {
  const cloudIds = Array.from(new Set(
    (cards || [])
      .map((item) => item.image)
      .filter((url) => media.isCloudFileId(url))
  ));
  if (cloudIds.length === 0) return;

  const urlMap = await media.resolveTempUrlMap(cloud, cloudIds, {
    scenario: 'getUserActions'
  });
  cards.forEach((item) => {
    if (media.isCloudFileId(item.image)) {
      item.image = urlMap.get(item.image) || item.image;
    }
  });
}

function normalizeTitle(value) {
  const text = String(value || '').trim();
  if (!text) return '未命名内容';
  return text.split('\n')[0].slice(0, 40);
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > maxLen) return '';
  return text;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function safeMessage(err) {
  if (!err) return 'unknown';
  return err.message || String(err).slice(0, 120);
}

function fail(error) {
  return { success: false, error };
}
