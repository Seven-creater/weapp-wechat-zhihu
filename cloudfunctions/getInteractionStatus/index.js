const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const MAX_ITEMS = 50;
const VALID_COLLECTIONS = new Set(["posts", "solutions", "comments"]);
const VALID_TYPES = new Set(["like", "collect"]);

function toSafeString(value, maxLen) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = toSafeString(raw.id, 64);
  const collection = toSafeString(raw.collection, 32);
  const type = toSafeString(raw.type, 16);
  if (!id || !VALID_COLLECTIONS.has(collection) || !VALID_TYPES.has(type)) return null;
  if (collection === "comments" && type !== "like") return null;
  return { id, collection, type };
}

function actionTypesFor(collection, type) {
  if (collection === "comments") return ["like_comment", "like"];
  if (type === "like") {
    return collection === "solutions" ? ["like_solution", "like"] : ["like_post", "like"];
  }
  return collection === "solutions"
    ? ["collect_solution", "collect"]
    : ["collect_post", "collect"];
}

function keyFor(item) {
  return `${item.collection}:${item.type}:${item.id}`;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, error: "unauthorized" };
  }

  const rawItems = Array.isArray(event.items) ? event.items : [];
  const items = rawItems.map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS);
  if (items.length === 0) {
    return { success: true, data: [] };
  }

  const ids = Array.from(new Set(items.map((item) => item.id)));
  const queryTypes = Array.from(
    new Set(items.flatMap((item) => actionTypesFor(item.collection, item.type)))
  );

  try {
    const actionRes = await db.collection("actions").where(
      _.and([
        { _openid: OPENID },
        { type: _.in(queryTypes) },
        _.or([{ targetId: _.in(ids) }, { postId: _.in(ids) }])
      ])
    ).field({
      targetId: true,
      postId: true,
      targetCollection: true,
      type: true
    }).limit(100).get();

    const active = new Set();
    const rows = actionRes.data || [];
    rows.forEach((row) => {
      items.forEach((item) => {
        const hitTarget = row.targetId === item.id || row.postId === item.id;
        if (!hitTarget) return;
        if (!actionTypesFor(item.collection, item.type).includes(row.type)) return;
        active.add(keyFor(item));
      });
    });

    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        collection: item.collection,
        type: item.type,
        status: active.has(keyFor(item))
      }))
    };
  } catch (err) {
    console.error("[getInteractionStatus] failed:", err && err.message ? err.message : err);
    return {
      success: false,
      error: "query failed"
    };
  }
};
