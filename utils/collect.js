// 通用收藏功能工具函数
const db = wx.cloud.database();
const _ = db.command;

/**
 * actions 集合数据库结构
 * {
 *   _id: string, // 自动生成
 *   _openid: string, // 用户openid
 *   // 兼容旧字段
 *   type: 'collect_solution' | 'collect_post' | 'collect', // 收藏类型
 *   postId?: string, // 历史字段
 *   targetId: string, // 方案ID或帖子ID
 *   title: string, // 标题（冗余存储）
 *   image: string, // 封面图（冗余存储）
 *   targetRoute: string, // 目标页面路径
 *   createTime: Date // 创建时间
 * }
 */

/**
 * 检查用户登录状态
 */
const checkLogin = function () {
  const app = getApp();
  return app
    .checkLogin()
    .then(() => true)
    .catch(() => {
      return new Promise((resolve, reject) => {
        wx.showModal({
          title: "提示",
          content: "请先登录后再操作",
          confirmText: "去登录",
          cancelText: "取消",
          success: (res) => {
            if (res.confirm) {
              app
                .login()
                .then(() => resolve(true))
                .catch((err) => reject(err));
              return;
            }
            reject(new Error("未登录"));
          },
        });
      });
    });
};

/**
 * 检查是否已收藏
 */
const checkIsCollected = function (type, targetId) {
  return new Promise((resolve, reject) => {
    if (!targetId) {
      resolve(false);
      return;
    }

    const normalizedType = type === "collect" ? "collect_post" : type;

    db.collection("actions")
      .where({
        type: normalizedType,
        targetId: targetId,
      })
      .get()
      .then((res) => {
        if (res.data.length > 0) {
          resolve(res.data.length > 0);
          return;
        }

        db.collection("actions")
          .where({
            type: normalizedType,
            postId: targetId,
          })
          .get()
          .then((fallbackRes) => {
            resolve(fallbackRes.data.length > 0);
          })
          .catch((fallbackErr) => {
            console.error("检查收藏状态失败:", fallbackErr);
            resolve(false);
          });
      })
      .catch((err) => {
        console.error("检查收藏状态失败:", err);
        resolve(false);
      });
  });
};

/**
 * 获取收藏数量
 */
const getCollectCount = function (type, targetId) {
  return new Promise((resolve, reject) => {
    if (!targetId) {
      resolve(0);
      return;
    }

    const normalizedType = type === "collect" ? "collect_post" : type;

    db.collection("actions")
      .where({
        type: normalizedType,
        targetId: targetId,
      })
      .count()
      .then((res) => {
        if ((res.total || 0) > 0) {
          resolve(res.total || 0);
          return;
        }

        db.collection("actions")
          .where({
            type: normalizedType,
            postId: targetId,
          })
          .count()
          .then((fallbackRes) => {
            resolve(fallbackRes.total || 0);
          })
          .catch((fallbackErr) => {
            console.error("获取收藏数量失败:", fallbackErr);
            resolve(0);
          });
      })
      .catch((err) => {
        console.error("获取收藏数量失败:", err);
        resolve(0);
      });
  });
};

/**
 * 通用收藏/取消收藏函数
 */
const toggleCollect = function (context, type, targetId, targetData) {
  return new Promise((resolve, reject) => {
    // 1. 检查登录状态
    checkLogin()
      .then((userInfo) => {
        const openid = wx.getStorageSync("openid");

        // 2. 获取当前收藏状态
        return checkIsCollected(type, targetId).then((isCollected) => {
          const newStatus = !isCollected;

          // 3. 乐观更新UI
          const currentCount = context.data.collectCount || 0;
          const newCount = newStatus
            ? currentCount + 1
            : Math.max(0, currentCount - 1);

          context.setData({
            isCollected: newStatus,
            collectCount: newCount,
          });

          // 4. 后台异步操作数据库
          if (newStatus) {
            // 添加到收藏
            return addToCollection(openid, type, targetId, targetData).then(
              () => {
                // 更新原帖子的收藏统计
                return updateTargetCollectionCount(type, targetId, 1);
              }
            );
          } else {
            // 取消收藏
            return removeFromCollection(openid, type, targetId).then(() => {
              // 更新原帖子的收藏统计
              return updateTargetCollectionCount(type, targetId, -1);
            });
          }
        });
      })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * 添加到收藏
 */
const addToCollection = function (openid, type, targetId, targetData) {
  return new Promise((resolve, reject) => {
    // 构建收藏数据

    const collectData = {
      type: type === "collect" ? "collect_post" : type,
      targetId: targetId,
      _openid: openid,
      title:
        targetData.title || targetData.content?.substring(0, 30) || "未命名",
      image: targetData.image || targetData.images?.[0] || "",
      targetRoute: getTargetRoute(type),
      createTime: db.serverDate(),
    };

    db.collection("actions")
      .add({
        data: collectData,
      })
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        console.error("添加收藏失败:", err);
        reject(err);
      });
  });
};

/**
 * 从收藏中移除
 */
const removeFromCollection = function (openid, type, targetId) {
  return new Promise((resolve, reject) => {
    const normalizedType = type === "collect" ? "collect_post" : type;

    db.collection("actions")
      .where({
        type: normalizedType,
        targetId: targetId,
      })
      .remove()
      .then((res) => {
        if (res.stats && res.stats.removed > 0) {
          resolve(res);
          return;
        }

        db.collection("actions")
          .where({
            type: normalizedType,
            postId: targetId,
          })
          .remove()
          .then((fallbackRes) => resolve(fallbackRes))
          .catch((fallbackErr) => {
            console.error("移除收藏失败:", fallbackErr);
            reject(fallbackErr);
          });
      })
      .catch((err) => {
        console.error("移除收藏失败:", err);
        reject(err);
      });
  });
};

/**
 * 更新目标对象的收藏统计
 */
const updateTargetCollectionCount = function (type, targetId, increment) {
  return new Promise((resolve, reject) => {
    let collectionName = "";
    if (type === "collect_solution") {
      collectionName = "solutions";
    } else if (type === "collect_post") {
      collectionName = "posts";
    }

    if (!collectionName) {
      resolve();
      return;
    }

    const normalizedType = type === "collect" ? "collect_post" : type;

    db.collection(collectionName)
      .doc(targetId)
      .update({
        data: {
          collectCount: db.command.inc(increment),
        },
      })
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        if (normalizedType === "collect_post") {
          resolve();
          return;
        }

        console.error("更新收藏统计失败:", err);
        // 这里不reject，因为统计更新失败不影响主要功能
        resolve();
      });
  });
};

/**
 * 获取目标页面路径
 */
const getTargetRoute = function (type) {
  switch (type) {
    case "collect_solution":
      return "/pages/solution-detail/index";
    case "collect_post":
    case "collect":
      return "/pages/post-detail/index";
    default:
      return "";
  }
};

/**
 * 初始化收藏状态
 */
const initCollectStatus = function (context, type, targetId) {
  return Promise.all([
    checkIsCollected(type, targetId),
    getCollectCount(type, targetId),
  ]).then(([isCollected, collectCount]) => {
    context.setData({
      isCollected: isCollected,
      collectCount: collectCount,
    });
  });
};

module.exports = {
  checkLogin,
  checkIsCollected,
  toggleCollect,
  initCollectStatus,
};
