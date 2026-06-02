const crypto = require('crypto');

const MAX_BATCH_SIZE = 50;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SCAN = 400;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_RETRY = 2;
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

function hashId(fileId) {
  if (!fileId || typeof fileId !== 'string') return '';
  return crypto.createHash('sha256').update(fileId).digest('hex').slice(0, 12);
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

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function readCache(fileId, now) {
  const cached = tempUrlCache.get(fileId);
  if (!cached) return '';
  if (cached.expiresAt <= now) {
    tempUrlCache.delete(fileId);
    return '';
  }
  return cached.url || '';
}

async function retryGetTempFileURL(cloud, fileList, retry = DEFAULT_RETRY) {
  let lastErr = null;
  for (let i = 0; i <= retry; i += 1) {
    try {
      const res = await cloud.getTempFileURL({ fileList });
      return Array.isArray(res && res.fileList) ? res.fileList : [];
    } catch (err) {
      lastErr = err;
      if (i === retry) break;
    }
  }
  throw lastErr || new Error('getTempFileURL failed');
}

async function resolveTempUrlMap(cloud, fileIds, options = {}) {
  const scenario = options.scenario || 'unknown';
  const retry = Number.isFinite(Number(options.retry)) ? Number(options.retry) : DEFAULT_RETRY;
  const ids = Array.from(new Set((fileIds || []).filter(isCloudFileId)));
  const mapping = new Map();
  if (!cloud || typeof cloud.getTempFileURL !== 'function' || ids.length === 0) {
    return mapping;
  }

  const now = Date.now();
  const misses = [];
  for (const id of ids) {
    const cached = readCache(id, now);
    if (cached) mapping.set(id, cached);
    else misses.push(id);
  }
  if (misses.length === 0) return mapping;

  const batches = chunk(misses, MAX_BATCH_SIZE);
  for (const batch of batches) {
    const key = batch.slice().sort().join('|');
    let request = inflight.get(key);
    if (!request) {
      request = retryGetTempFileURL(cloud, batch, retry)
        .catch((err) => {
          const failHashes = batch.map(hashId).filter(Boolean).slice(0, 8);
          console.warn('[media.resolveTempUrlMap] failed', {
            scenario,
            err: err && err.message ? err.message : 'unknown',
            batchSize: batch.length,
            sample: failHashes
          });
          return [];
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, request);
    }

    const rows = await request;
    const failed = [];
    for (const row of rows) {
      const id = row && row.fileID;
      const url = row && row.tempFileURL;
      if (!id) continue;
      if (url) {
        const maxAgeSec = Number(row.maxAge);
        const ttlMs = Number.isFinite(maxAgeSec) && maxAgeSec > 0
          ? maxAgeSec * 1000
          : DEFAULT_TTL_MS;
        const expiresAt = Date.now() + Math.max(ttlMs - 5000, 30000);
        tempUrlCache.set(id, { url, expiresAt });
        mapping.set(id, url);
      } else {
        failed.push(hashId(id));
      }
    }

    if (failed.length) {
      console.warn('[media.resolveTempUrlMap] partial', {
        scenario,
        failed: failed.slice(0, 8),
        failedCount: failed.length
      });
    }
  }

  return mapping;
}

function collectCloudFileIdsDeep(value, set = new Set(), options = {}) {
  const maxScan = Number.isFinite(Number(options.maxScan)) ? Number(options.maxScan) : DEFAULT_MAX_SCAN;
  const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : DEFAULT_MAX_DEPTH;
  let scanned = 0;

  function walk(node, depth) {
    if (scanned >= maxScan || depth > maxDepth) return;
    scanned += 1;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (scanned >= maxScan) break;
        walk(item, depth + 1);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (scanned >= maxScan) break;
        walk(node[key], depth + 1);
      }
      return;
    }
    if (isCloudFileId(node)) {
      set.add(node);
    }
  }

  walk(value, 0);
  return set;
}

function replaceCloudUrlsDeep(value, mapping, options = {}) {
  const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : DEFAULT_MAX_DEPTH;

  function walk(node, depth) {
    if (depth > maxDepth) return node;
    if (node instanceof Date) return node;
    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1));
    }
    if (isPlainObject(node)) {
      const next = {};
      for (const key of Object.keys(node)) {
        next[key] = walk(node[key], depth + 1);
      }
      return next;
    }
    if (!isCloudFileId(node)) return node;
    return mapping.get(node) || node;
  }

  return walk(value, 0);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function pickImageFromDoc(doc) {
  return pickCardImage(doc);
}

function normalizeAvatarUrl(url, fallback = '/images/zhi.png') {
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  return trimmed || fallback;
}

module.exports = {
  isCloudFileId,
  hashId,
  isTemporaryMediaUrl,
  collectCloudFileIdsDeep,
  resolveTempUrlMap,
  replaceCloudUrlsDeep,
  pickImageFromDoc,
  pickCardImage,
  pickDetailImages,
  normalizeAvatarUrl
};
