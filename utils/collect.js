// 通用收藏工具：只调用云函数，不在客户端直连 actions 集合。
const toggleCollectLocks = new Set();

function checkLogin() {
  const app = getApp();
  return app
    .checkLogin()
    .then(() => true)
    .catch(() => new Promise((resolve, reject) => {
      wx.showModal({
        title: '提示',
        content: '请先登录后再操作',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) {
            reject(new Error('not logged in'));
            return;
          }
          app.login().then(() => resolve(true)).catch(reject);
        }
      });
    }));
}

function collectionFromType(type) {
  return type === 'collect_solution' ? 'solutions' : 'posts';
}

function checkIsCollected(type, targetId) {
  if (!targetId) return Promise.resolve(false);
  const openid = wx.getStorageSync('openid');
  if (!openid) return Promise.resolve(false);

  return wx.cloud.callFunction({
    name: 'getInteractionStatus',
    data: {
      items: [{
        id: targetId,
        collection: collectionFromType(type),
        type: 'collect'
      }]
    }
  }).then((res) => {
    const rows = (res.result && res.result.data) || [];
    return !!(rows[0] && rows[0].status);
  }).catch((err) => {
    console.error('check collect status failed:', err);
    return false;
  });
}

function getCollectCount() {
  return Promise.resolve(0);
}

function toggleCollect(context, type, targetId) {
  const lockKey = `${type}:${targetId}`;
  if (toggleCollectLocks.has(lockKey)) {
    return Promise.resolve({
      success: true,
      status: !!context.data.isCollected,
      count: context.data.collectCount || 0
    });
  }

  toggleCollectLocks.add(lockKey);
  const prevStatus = !!context.data.isCollected;
  const prevCount = Number(context.data.collectCount || 0);
  const nextStatus = !prevStatus;
  const nextCount = nextStatus ? prevCount + 1 : Math.max(0, prevCount - 1);

  return checkLogin()
    .then(() => {
      context.setData({
        isCollected: nextStatus,
        collectCount: nextCount
      });

      return wx.cloud.callFunction({
        name: 'toggleInteraction',
        data: {
          id: targetId,
          collection: collectionFromType(type),
          type: 'collect'
        }
      });
    })
    .then((res) => {
      const payload = res.result || {};
      if (!payload.success) {
        throw new Error(payload.error || 'collect failed');
      }
      const finalStatus = typeof payload.status === 'boolean' ? payload.status : nextStatus;
      const finalCount = typeof payload.count === 'number' ? payload.count : nextCount;
      context.setData({
        isCollected: finalStatus,
        collectCount: finalCount
      });
      return payload;
    })
    .catch((err) => {
      context.setData({
        isCollected: prevStatus,
        collectCount: prevCount
      });
      throw err;
    })
    .finally(() => {
      toggleCollectLocks.delete(lockKey);
    });
}

function initCollectStatus(context, type, targetId) {
  return checkIsCollected(type, targetId).then((isCollected) => {
    context.setData({ isCollected });
  });
}

module.exports = {
  checkLogin,
  checkIsCollected,
  toggleCollect,
  initCollectStatus,
  getCollectCount
};
