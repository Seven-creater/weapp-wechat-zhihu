const MAX_BATCH_SIZE = 50;

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

function normalizeMediaValue(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const keys = ['url', 'src', 'image', 'imageUrl', 'fileId', 'fileID'];
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }
  return '';
}

function appendCandidates(list, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => appendCandidates(list, item));
    return;
  }
  const candidate = normalizeMediaValue(value);
  if (candidate) list.push(candidate);
}

function pickImageFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const candidates = [];
  appendCandidates(candidates, doc.images);
  appendCandidates(candidates, doc.coverImage);
  appendCandidates(candidates, doc.image);
  appendCandidates(candidates, doc.coverImg);
  appendCandidates(candidates, doc.beforeImg);
  appendCandidates(candidates, doc.afterImg);
  appendCandidates(candidates, doc.imageUrl);

  const seen = new Set();
  for (const item of candidates) {
    const value = normalizeMediaValue(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    return value;
  }
  return '';
}

async function resolveTempUrlMap(cloud, fileIds) {
  const ids = Array.from(new Set((fileIds || []).filter(isCloudFileId)));
  const mapping = new Map();
  if (!cloud || typeof cloud.getTempFileURL !== 'function' || ids.length === 0) {
    return mapping;
  }

  for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
    const batch = ids.slice(i, i + MAX_BATCH_SIZE);
    try {
      const res = await cloud.getTempFileURL({ fileList: batch });
      (res.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) {
          mapping.set(item.fileID, item.tempFileURL);
        }
      });
    } catch (err) {
      console.warn('[getUserActions.media] getTempFileURL failed:', err && err.message ? err.message : err);
    }
  }
  return mapping;
}

module.exports = {
  isCloudFileId,
  pickImageFromDoc,
  resolveTempUrlMap
};
