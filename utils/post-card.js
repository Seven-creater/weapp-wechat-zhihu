function normalizeTitle(value) {
  const text = String(value || '').trim();
  if (!text) return 'Untitled';
  return text.split('\n')[0].slice(0, 40);
}

function pickImage(doc) {
  if (!doc) return '';
  if (doc.image) return doc.image;
  if (doc.coverImg) return doc.coverImg;
  if (doc.beforeImg) return doc.beforeImg;
  if (doc.imageUrl) return doc.imageUrl;
  if (doc.coverImage) return doc.coverImage;
  if (doc.afterImg) return doc.afterImg;
  if (Array.isArray(doc.images) && doc.images.length > 0) return doc.images[0];
  return '';
}

function buildPostCard(doc, collection = 'posts') {
  const image = pickImage(doc);
  const stats = doc && doc.stats ? doc.stats : {};

  return {
    id: doc._id,
    title: normalizeTitle(doc.title || doc.description || doc.content || ''),
    image: image || '/images/24213.jpg',
    hasImage: !!image,
    likes: typeof stats.like === 'number' ? stats.like : 0,
    route: collection === 'solutions'
      ? '/pages/solution-detail/index'
      : '/pages/post-detail/index',
    collection,
  };
}

function convertCloudImageItems(items, imageKey = 'image') {
  const list = items || [];
  const cloudUrls = list
    .map((item) => item && item[imageKey])
    .filter((url) => typeof url === 'string' && url.indexOf('cloud://') === 0);

  if (cloudUrls.length === 0) {
    return Promise.resolve(list);
  }

  const unique = Array.from(new Set(cloudUrls));

  return wx.cloud.getTempFileURL({ fileList: unique })
    .then((res) => {
      const mapping = new Map();
      (res.fileList || []).forEach((file) => {
        if (file.fileID && file.tempFileURL) {
          mapping.set(file.fileID, file.tempFileURL);
        }
      });

      return list.map((item) => ({
        ...item,
        [imageKey]: mapping.get(item[imageKey]) || item[imageKey],
      }));
    })
    .catch(() => list);
}

module.exports = {
  normalizeTitle,
  pickImage,
  buildPostCard,
  convertCloudImageItems,
};
