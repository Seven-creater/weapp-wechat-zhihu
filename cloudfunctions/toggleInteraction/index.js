// 云函数入口文件
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 验证必填参数
  const { id, collection, type } = event;
  if (!id || !collection || !type) {
    return {
      success: false,
      error: "缺少必要参数: id, collection, type",
    };
  }

  // 验证参数有效性
  const validCollections = ["posts", "solutions"];
  const validTypes = ["like", "collect"];

  if (!validCollections.includes(collection)) {
    return {
      success: false,
      error: `无效的集合名称，支持: ${validCollections.join(", ")}`,
    };
  }

  if (!validTypes.includes(type)) {
    return {
      success: false,
      error: `无效的操作类型，支持: ${validTypes.join(", ")}`,
    };
  }

  try {
    // 构建 action 类型
    const actionType = type === "like" ? "like_post" : "collect_post";

    // 查询用户是否已经点赞/收藏
    const actionRes = await db
      .collection("actions")
      .where({
        _openid: openid,
        type: actionType,
        targetId: id,
      })
      .get();

    const existingAction = actionRes.data[0];

    // 获取当前帖子的统计信息
    const targetRes = await db.collection(collection).doc(id).get();
    const targetData = targetRes.data;

    if (!targetData) {
      return {
        success: false,
        error: "目标数据不存在",
      };
    }

    let newCount;
    let actionResult;

    if (existingAction) {
      // ============================================
      // 取消点赞/收藏
      // ============================================
      console.log(`取消${type}: ${id}`);

      // 删除 action 记录
      await db.collection("actions").doc(existingAction._id).remove();

      // 更新主表计数
      const statsField = type === "like" ? "stats.like" : "stats.collect";
      const currentCount = (targetData.stats && targetData.stats[type]) || 0;
      newCount = Math.max(0, currentCount - 1);

      await db.collection(collection).doc(id).update({
        data: {
          [statsField]: newCount,
          updateTime: db.serverDate(),
        },
      });

      actionResult = {
        status: false,
        count: newCount,
      };
    } else {
      // ============================================
      // 新增点赞/收藏
      // ============================================
      console.log(`执行${type}: ${id}`);

      // 添加 action 记录
      const addRes = await db.collection("actions").add({
        data: {
          type: actionType,
          targetId: id,
          targetCollection: collection,
          createTime: db.serverDate(),
        },
      });

      // 更新主表计数
      const statsField = type === "like" ? "stats.like" : "stats.collect";
      const currentCount = (targetData.stats && targetData.stats[type]) || 0;
      newCount = currentCount + 1;

      await db.collection(collection).doc(id).update({
        data: {
          [statsField]: newCount,
          updateTime: db.serverDate(),
        },
      });

      actionResult = {
        status: true,
        count: newCount,
        actionId: addRes._id,
      };
    }

    return {
      success: true,
      ...actionResult,
    };
  } catch (err) {
    console.error("toggleInteraction 错误:", err);
    return {
      success: false,
      error: err.message || "操作失败",
    };
  }
};
