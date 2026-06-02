const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const media = require('./media');

exports.main = async (event = {}) => {
  try {
    const issueId = toSafeString(event.issueId, 64);
    if (!issueId) {
      return {
        success: false,
        error: 'missing issueId'
      };
    }

    const result = await db.collection('design_proposals')
      .where(_.or([{ issueId }, { postId: issueId }]))
      .field({
        _id: true,
        _openid: true,
        postId: true,
        issueId: true,
        designerId: true,
        designerName: true,
        designerAvatar: true,
        designerInfo: true,
        description: true,
        content: true,
        images: true,
        budgetAdjustment: true,
        priceAdjustment: true,
        quoteAmount: true,
        estimateDays: true,
        adjustmentReason: true,
        submitterType: true,
        sourcePostType: true,
        status: true,
        createTime: true,
        updateTime: true
      })
      .orderBy('createTime', 'desc')
      .get();

    const docs = Array.isArray(result.data) ? result.data : [];
    const designerMap = await fetchDesignerMap(extractDesignerIds(docs));
    const normalized = docs
      .map((item) => normalizeProposalDoc(item, designerMap))
      .filter(Boolean);
    const data = await replaceMediaList(normalized);

    return {
      success: true,
      data
    };
  } catch (err) {
    console.error('[getDesignProposals] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'query failed'
    };
  }
};

async function fetchDesignerMap(openids) {
  const ids = Array.from(new Set((openids || []).filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return {};

  const userRes = await db.collection('users')
    .where({ _openid: _.in(ids) })
    .field({
      _openid: true,
      userInfo: true
    })
    .limit(ids.length)
    .get();

  const rows = Array.isArray(userRes.data) ? userRes.data : [];
  const avatarIds = new Set();
  rows.forEach((row) => {
    const avatar = row && row.userInfo && row.userInfo.avatarUrl;
    if (media.isCloudFileId(avatar)) {
      avatarIds.add(avatar);
    }
  });
  const avatarMap = await media.resolveTempUrlMap(cloud, Array.from(avatarIds), {
    scenario: 'getDesignProposals.designerAvatar'
  });

  return rows.reduce((acc, row) => {
    if (!row || !row._openid) return acc;
    let avatarUrl = row.userInfo && row.userInfo.avatarUrl;
    if (media.isCloudFileId(avatarUrl)) {
      avatarUrl = avatarMap.get(avatarUrl) || avatarUrl;
    }
    acc[row._openid] = {
      nickName: pickText(row.userInfo && row.userInfo.nickName, '设计师'),
      avatarUrl
    };
    return acc;
  }, {});
}

function extractDesignerIds(list) {
  return (list || [])
    .map((item) => toSafeString(item && (item.designerId || item._openid), 64))
    .filter(Boolean);
}

function normalizeProposalDoc(doc, designerMap = {}) {
  if (!doc || typeof doc !== 'object') return null;

  const legacyInfo = doc.designerInfo || {};
  const designerId = toSafeString(doc.designerId || doc._openid, 64);
  const liveDesigner = designerMap[designerId] || null;
  const designerName = pickText(
    doc.designerName,
    liveDesigner && liveDesigner.nickName,
    legacyInfo.nickName,
    '设计师'
  );
  const designerAvatar = pickAvatar(
    liveDesigner && liveDesigner.avatarUrl,
    doc.designerAvatar,
    legacyInfo.avatarUrl
  );
  const detailImages = media.pickDetailImages(doc);
  const description = pickText(doc.description, doc.content, '');
  const budgetAdjustment = normalizeNumber(doc.budgetAdjustment, doc.priceAdjustment);
  const quoteAmount = normalizeNumber(doc.quoteAmount, budgetAdjustment);
  const estimateDays = normalizeNumber(doc.estimateDays, 0);

  return {
    ...doc,
    issueId: toSafeString(doc.issueId || doc.postId, 64),
    designerId,
    designerName,
    designerAvatar,
    designerInfo: {
      ...legacyInfo,
      nickName: designerName,
      avatarUrl: designerAvatar,
      userId: legacyInfo.userId || designerId
    },
    description,
    content: description || doc.content || '',
    images: detailImages.gallery,
    budgetAdjustment,
    quoteAmount,
    estimateDays,
    submitterType: toSafeString(doc.submitterType, 32) || 'designer',
    sourcePostType: toSafeString(doc.sourcePostType, 32) || ''
  };
}

async function replaceMediaList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const cloudIds = new Set();
  list.forEach((item) => media.collectCloudFileIdsDeep(item, cloudIds, { maxScan: 160, maxDepth: 6 }));
  const urlMap = await media.resolveTempUrlMap(cloud, Array.from(cloudIds), {
    scenario: 'getDesignProposals'
  });
  return list.map((item) => media.replaceCloudUrlsDeep(item, urlMap, { maxDepth: 6 }));
}

function pickText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function pickAvatar() {
  const values = Array.prototype.slice.call(arguments)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  const preferred = values.find((item) => !media.isTemporaryMediaUrl(item));
  return media.normalizeAvatarUrl(preferred || values[0] || '', '/images/zhi.png');
}

function normalizeNumber(primary, fallback) {
  const first = Number(primary);
  if (Number.isFinite(first)) return first;
  const second = Number(fallback);
  if (Number.isFinite(second)) return second;
  return 0;
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
