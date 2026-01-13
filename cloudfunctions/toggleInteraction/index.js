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
  const validCollections = ["posts", "solutions", "comments"];
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

  if (collection === "comments" && type !== "like") {
    return {
      success: false,
      error: "评论仅支持点赞操作",
    };
  }

  try {
    // 构建 action 类型
    const actionType =
      collection === "comments"
        ? "like_comment"
        : type === "like"
          ? collection === "solutions"
            ? "like_solution"
            : "like_post"
          : collection === "solutions"
            ? "collect_solution"
            : "collect_post";

    const actionTypesForQuery =
      collection === "comments"
        ? ["like_comment", "like"]
        : type === "like"
          ? collection === "solutions"
            ? ["like_solution", "like_post"]
            : ["like_post"]
          : collection === "solutions"
            ? ["collect_solution", "collect_post", "collect"]
            : ["collect_post", "collect"];

    // 查询用户是否已经点赞/收藏
    const actionQuery = db
      .collection("actions")
      .where(
        _.and([
          { _openid: openid },
          { type: _.in(actionTypesForQuery) },
          _.or([{ targetId: id }, { postId: id }]),
        ])
      );

    const actionRes = await actionQuery.get();

    if (actionRes.data.length > 1) {
      const dupIds = actionRes.data.slice(1).map((item) => item._id);
      if (dupIds.length > 0) {
        await Promise.all(
          dupIds.map((dupId) => db.collection("actions").doc(dupId).remove())
        );
      }
    }

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

    const currentCount =
      collection === "comments"
        ? typeof targetData.likeCount === "number"
          ? targetData.likeCount
          : targetData.likes || 0
        : type === "like"
          ? (targetData.stats && targetData.stats.like) || 0
          : typeof targetData.collectCount === "number"
            ? targetData.collectCount
            : (targetData.stats && targetData.stats.collect) || 0;

    if (existingAction) {
      // ============================================
      // 取消点赞/收藏
      // ============================================
      console.log(`取消${type}: ${id}`);

      // 删除 action 记录
      await db.collection("actions").doc(existingAction._id).remove();

      // 更新主表计数
      newCount = Math.max(0, currentCount - 1);

      const updateData = {
        updateTime: db.serverDate(),
      };

      if (collection === "comments") {
        if (typeof targetData.likeCount === "number") {
          updateData.likeCount = newCount;
        } else {
          updateData.likes = newCount;
        }
      } else if (type === "like") {
        updateData["stats.like"] = newCount;
      } else {
        updateData.collectCount = newCount;
        updateData["stats.collect"] = newCount;
      }

      await db.collection(collection).doc(id).update({
        data: updateData,
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

      const titleSource =
        targetData.title || targetData.description || targetData.content || "";
      const title = titleSource
        ? String(titleSource).slice(0, 30)
        : "未命名项目";

      const image =
        targetData.image ||
        targetData.coverImg ||
        targetData.beforeImg ||
        targetData.imageUrl ||
        targetData.coverImage ||
        targetData.afterImg ||
        (Array.isArray(targetData.images) ? targetData.images[0] : "") ||
        "";

      const targetRoute =
        collection === "solutions"
          ? "/pages/solution-detail/index"
          : collection === "comments"
            ? ""
            : "/pages/post-detail/index";

      // 添加 action 记录
      const actionData = {
        type: actionType,
        targetId: id,
        targetCollection: collection,
        _openid: openid,
        createTime: db.serverDate(),
      };

      if (collection === "comments" && targetData.postId) {
        actionData.postId = targetData.postId;
      } else if (type === "collect") {
        actionData.title = title;
        actionData.image = image;
        actionData.targetRoute = targetRoute;
      }

      const addRes = await db.collection("actions").add({
        data: actionData,
      });

      // 更新主表计数
      newCount = currentCount + 1;

      const updateData = {
        updateTime: db.serverDate(),
      };

      if (collection === "comments") {
        if (typeof targetData.likeCount === "number") {
          updateData.likeCount = newCount;
        } else {
          updateData.likes = newCount;
        }
      } else if (type === "like") {
        updateData["stats.like"] = newCount;
      } else {
        updateData.collectCount = newCount;
        updateData["stats.collect"] = newCount;
      }

      await db.collection(collection).doc(id).update({
        data: updateData,
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
