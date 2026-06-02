const MAX_BATCH_SIZE = 50;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETRY_TIMES = 2;

const TEMP_QUERY_HINTS = [
  'sign=',
  'signature=',
  'token=',
  'auth=',
  'expires=',
  'expiration=',
  'x-cos-security-token=',
  'x-amz-signature=',
  'x-amz-security-token=',
  'x-oss-signature=',
  'ossaccesskeyid=',
  'googleaccessid='
];

const tempUrlCache = new Map();
const inflight = new Map();

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

function normalizeMediaValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }

  const keys = ['url', 'src', 'image', 'imageUrl', 'fileId', 'fileID'];
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }
  return '';
}

function appendMediaCandidates(list, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => appendMediaCandidates(list, item));
    return list;
  }

  const candidate = normalizeMediaValue(value);
  if (candidate) {
    list.push(candidate);
  }
  return list;
}

function dedupeCandidates(list) {
  const seen = new Set();
  const output = [];
  (list || []).forEach((item) => {
    const candidate = normalizeMediaValue(item);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    output.push(candidate);
  });
  return output;
}

function isLocalMediaPath(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  return (
    text.indexOf('/images/') === 0 ||
    text.indexOf('/') === 0 ||
    text.indexOf('./') === 0 ||
    text.indexOf('../') === 0 ||
    text.indexOf('images/') === 0 ||
    text.indexOf('data:') === 0
  );
}

function isHttpMediaUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function isTemporaryMediaUrl(url) {
  const value = normalizeMediaValue(url);
  if (!value) return false;
  if (value.indexOf('wxfile://') === 0 || value.indexOf('blob:') === 0) {
    return true;
  }
  if (!isHttpMediaUrl(value)) {
    return false;
  }

  const lower = value.toLowerCase();
  const queryIndex = lower.indexOf('?');
  const query = queryIndex > -1 ? lower.slice(queryIndex + 1) : '';
  if (!query) {
    return false;
  }
  return TEMP_QUERY_HINTS.some((hint) => query.indexOf(hint) > -1);
}

function isPreferredMediaCandidate(value) {
  const candidate = normalizeMediaValue(value);
  if (!candidate) return false;
  if (isCloudFileId(candidate) || isLocalMediaPath(candidate)) {
    return true;
  }
  if (isTemporaryMediaUrl(candidate)) {
    return false;
  }
  return true;
}

function pickFirstCandidate(list, allowTemporaryFallback = true) {
  const candidates = dedupeCandidates(list);
  const preferred = candidates.find((item) => isPreferredMediaCandidate(item));
  if (preferred) {
    return preferred;
  }
  return allowTemporaryFallback ? (candidates[0] || '') : '';
}

function buildGallery(doc) {
  const gallery = [];
  appendMediaCandidates(gallery, doc && doc.images);
  appendMediaCandidates(gallery, doc && doc.photos);
  appendMediaCandidates(gallery, doc && doc.milestonePhotos);
  appendMediaCandidates(gallery, doc && doc.beforeImg);
  appendMediaCandidates(gallery, doc && doc.afterImg);
  appendMediaCandidates(gallery, doc && doc.coverImage);
  appendMediaCandidates(gallery, doc && doc.image);
  appendMediaCandidates(gallery, doc && doc.coverImg);
  appendMediaCandidates(gallery, doc && doc.imageUrl);
  return dedupeCandidates(gallery);
}

function pickCardImage(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const candidates = [];
  appendMediaCandidates(candidates, doc.images);
  appendMediaCandidates(candidates, doc.coverImage);
  appendMediaCandidates(candidates, doc.image);
  appendMediaCandidates(candidates, doc.coverImg);
  appendMediaCandidates(candidates, doc.beforeImg);
  appendMediaCandidates(candidates, doc.afterImg);
  appendMediaCandidates(candidates, doc.imageUrl);
  appendMediaCandidates(candidates, doc.photos);
  appendMediaCandidates(candidates, doc.milestonePhotos);
  return pickFirstCandidate(candidates);
}

function pickDetailImages(doc) {
  if (!doc || typeof doc !== 'object') {
    return {
      hero: '',
      before: '',
      after: '',
      gallery: []
    };
  }

  const gallery = buildGallery(doc);
  const imageList = dedupeCandidates(doc.images || []);

  const hero = pickFirstCandidate([
    ...imageList,
    doc.beforeImg,
    doc.coverImage,
    doc.image,
    doc.coverImg,
    doc.imageUrl,
    doc.afterImg,
    ...(doc.photos || [])
  ]);

  const before = pickFirstCandidate([
    doc.beforeImg,
    ...imageList,
    doc.coverImage,
    doc.image,
    doc.coverImg,
    doc.imageUrl
  ]);

  const after = pickFirstCandidate([
    doc.afterImg,
    ...imageList.slice(1),
    ...gallery.slice(1),
    doc.coverImage,
    doc.image,
    doc.coverImg,
    doc.imageUrl
  ]);

  return {
    hero: hero || before || after || '',
    before: before || hero || '',
    after: after || '',
    gallery
  };
}

function pickImageFromDoc(doc) {
  return pickCardImage(doc);
}

function collectCloudFileIdsDeep(value, set = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCloudFileIdsDeep(item, set));
    return set;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => collectCloudFileIdsDeep(value[key], set));
    return set;
  }
  if (isCloudFileId(value)) {
    set.add(value);
  }
  return set;
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function readCache(fileId, now) {
  const hit = tempUrlCache.get(fileId);
  if (!hit) return '';
  if (hit.expiresAt <= now) {
    tempUrlCache.delete(fileId);
    return '';
  }
  return hit.url || '';
}

async function resolveTempUrlMap(fileIds) {
  const ids = Array.from(new Set((fileIds || []).filter(isCloudFileId)));
  const mapping = new Map();
  if (ids.length === 0) return mapping;

  const now = Date.now();
  const misses = [];
  ids.forEach((id) => {
    const cached = readCache(id, now);
    if (cached) mapping.set(id, cached);
    else misses.push(id);
  });

  if (misses.length === 0) return mapping;

  const parts = chunk(misses, MAX_BATCH_SIZE);
  for (const part of parts) {
    const key = part.slice().sort().join('|');
    let request = inflight.get(key);
    if (!request) {
      request = getTempFileURLWithRetry(part, DEFAULT_RETRY_TIMES)
        .catch(() => [])
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, request);
    }

    const list = await request;
    list.forEach((file) => {
      if (!file || !file.fileID || !file.tempFileURL) return;
      const ttlMs = Number(file.maxAge) > 0 ? Number(file.maxAge) * 1000 : DEFAULT_TTL_MS;
      const expiresAt = Date.now() + Math.max(ttlMs - 5000, 30000);
      tempUrlCache.set(file.fileID, {
        url: file.tempFileURL,
        expiresAt
      });
      mapping.set(file.fileID, file.tempFileURL);
    });
  }

  return mapping;
}

async function getTempFileURLWithRetry(fileList, retryTimes) {
  let lastErr = null;
  for (let i = 0; i <= retryTimes; i += 1) {
    try {
      const res = await wx.cloud.getTempFileURL({ fileList });
      return res && Array.isArray(res.fileList) ? res.fileList : [];
    } catch (err) {
      lastErr = err;
      if (i === retryTimes) break;
    }
  }
  throw lastErr || new Error('getTempFileURL failed');
}

function toTempUrl(value, mapping) {
  if (!isCloudFileId(value)) return value;
  return mapping.get(value) || value;
}

function replaceCloudUrlsDeep(value, mapping) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceCloudUrlsDeep(item, mapping));
  }
  if (value instanceof Date) {
    return value;
  }
  if (isPlainObject(value)) {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = replaceCloudUrlsDeep(value[key], mapping);
    });
    return next;
  }
  return toTempUrl(value, mapping);
}

function normalizeAvatarUrl(url, fallback = '/images/zhi.png') {
  const value = typeof url === 'string' ? url.trim() : '';
  return value || fallback;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

module.exports = {
  isCloudFileId,
  isTemporaryMediaUrl,
  pickImageFromDoc,
  pickCardImage,
  pickDetailImages,
  collectCloudFileIdsDeep,
  resolveTempUrlMap,
  toTempUrl,
  replaceCloudUrlsDeep,
  normalizeAvatarUrl
};
