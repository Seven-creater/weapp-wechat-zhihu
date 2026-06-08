const MAX_BATCH_SIZE = 50;

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

function normalizeAvatarUrl(url, fallback = '/images/zhi.png') {
  if (typeof url !== 'string') return fallback;
  const text = url.trim();
  return text || fallback;
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
      console.warn('[getPostComments.media] getTempFileURL failed:', err && err.message ? err.message : err);
    }
  }
  return mapping;
}

module.exports = {
  isCloudFileId,
  normalizeAvatarUrl,
  resolveTempUrlMap
};
