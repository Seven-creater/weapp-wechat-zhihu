const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const media = require("../_shared/media");

const VALID_COLLECTIONS = new Set(["posts", "solutions", "comments"]);
const VALID_TYPES = new Set(["like", "collect"]);

function getCurrentCount(collection, type, targetData) {
  if (!targetData) return 0;

  if (collection === "comments") {
    if (typeof targetData.likeCount === "number") return targetData.likeCount;
    return targetData.likes || 0;
  }

  if (type === "like") {
    return (targetData.stats && targetData.stats.like) || 0;
  }

  if (typeof targetData.collectCount === "number") return targetData.collectCount;
  return (targetData.stats && targetData.stats.collect) || 0;
}

function buildActionType(collection, type) {
  if (collection === "comments") return "like_comment";
  if (type === "like") {
    return collection === "solutions" ? "like_solution" : "like_post";
  }
  return collection === "solutions" ? "collect_solution" : "collect_post";
}

function buildQueryTypes(collection, type) {
  if (collection === "comments") {
    return ["like_comment", "like"];
  }
  if (type === "like") {
    return collection === "solutions" ? ["like_solution", "like_post"] : ["like_post"];
  }
  return collection === "solutions"
    ? ["collect_solution", "collect_post", "collect"]
    : ["collect_post", "collect"];
}

function buildUpdateData(collection, type, delta) {
  const updateData = { updateTime: db.serverDate() };
  if (collection === "comments") {
    updateData.likeCount = _.inc(delta);
    return updateData;
  }
  if (type === "like") {
    updateData["stats.like"] = _.inc(delta);
    return updateData;
  }
  updateData.collectCount = _.inc(delta);
  updateData["stats.collect"] = _.inc(delta);
  return updateData;
}

function buildCollectPayload(id, collection, openid, targetData) {
  const titleSource =
    targetData.title || targetData.description || targetData.content || "";
  const title = titleSource ? String(titleSource).slice(0, 30) : "未命名内容";
  const image = media.pickImageFromDoc(targetData) || "";
  const targetRoute =
    collection === "solutions"
      ? "/pages/solution-detail/index"
      : "/pages/post-detail/index";

  return {
    type: buildActionType(collection, "collect"),
    targetId: id,
    targetCollection: collection,
    targetRoute,
    title,
    image,
    _openid: openid,
    createTime: db.serverDate()
  };
}

function toSafeString(value, maxLen) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const id = toSafeString(event.id, 64);
  const collection = toSafeString(event.collection, 32);
  const type = toSafeString(event.type, 16);

  if (!OPENID) {
    return {
      success: false,
      error: "unauthorized"
    };
  }

  if (!id || !collection || !type) {
    return {
      success: false,
      error: "missing required params"
    };
  }

  if (!VALID_COLLECTIONS.has(collection)) {
    return {
      success: false,
      error: "invalid collection"
    };
  }

  if (!VALID_TYPES.has(type)) {
    return {
      success: false,
      error: "invalid type"
    };
  }

  if (collection === "comments" && type !== "like") {
    return {
      success: false,
      error: "comment only supports like"
    };
  }

  const transaction = await db.startTransaction();
  try {
    const queryTypes = buildQueryTypes(collection, type);
    const actionRes = await transaction.collection("actions").where(
      _.and([
        { _openid: OPENID },
        { type: _.in(queryTypes) },
        _.or([{ targetId: id }, { postId: id }])
      ])
    ).get();

    const rows = actionRes.data || [];
    const existingAction = rows[0] || null;
    const duplicateActions = rows.slice(1);

    if (duplicateActions.length > 0) {
      await Promise.all(
        duplicateActions.map((row) =>
          transaction.collection("actions").doc(row._id).remove()
        )
      );
    }

    const targetRes = await transaction.collection(collection).doc(id).get();
    const targetData = targetRes.data;
    if (!targetData) {
      await transaction.rollback();
      return {
        success: false,
        error: "target not found"
      };
    }

    const delta = existingAction ? -1 : 1;
    const updateData = buildUpdateData(collection, type, delta);

    if (existingAction) {
      await transaction.collection("actions").doc(existingAction._id).remove();
      await transaction.collection(collection).doc(id).update({ data: updateData });
      await transaction.commit();

      const latest = await db.collection(collection).doc(id).get();
      return {
        success: true,
        status: false,
        count: Math.max(0, getCurrentCount(collection, type, latest.data))
      };
    }

    let actionData = {
      type: buildActionType(collection, type),
      targetId: id,
      targetCollection: collection,
      _openid: OPENID,
      createTime: db.serverDate()
    };

    if (collection === "comments" && targetData.postId) {
      actionData.postId = targetData.postId;
    } else if (type === "collect") {
      actionData = buildCollectPayload(id, collection, OPENID, targetData);
    }

    const addRes = await transaction.collection("actions").add({ data: actionData });
    await transaction.collection(collection).doc(id).update({ data: updateData });
    await transaction.commit();

    const latest = await db.collection(collection).doc(id).get();
    return {
      success: true,
      status: true,
      count: Math.max(0, getCurrentCount(collection, type, latest.data)),
      actionId: addRes._id
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {}

    console.error("[toggleInteraction] failed:", err);
    return {
      success: false,
      error: err && err.message ? err.message : "operation failed"
    };
  }
};
