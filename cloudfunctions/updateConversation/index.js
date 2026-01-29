const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const getUserInfoByOpenid = async (openid) => {
  const res = await db.collection("users").where({ _openid: openid }).limit(1).get();
  return res.data?.[0]?.userInfo || null;
};

const upsertConversation = async ({
  ownerId,
  targetId,
  targetUserInfo,
  lastMessage,
  updateTime,
  unreadOnUpdate,
  unreadOnCreate,
}) => {
  const existed = await db
    .collection("conversations")
    .where({ ownerId, targetId })
    .limit(1)
    .get();

  if (existed.data && existed.data.length > 0) {
    const docId = existed.data[0]._id;
    const updateData = {
      targetUserInfo: targetUserInfo || {},
      lastMessage,
      updateTime,
    };
    if (unreadOnUpdate) {
      Object.assign(updateData, unreadOnUpdate);
    }
    await db.collection("conversations").doc(docId).update({ data: updateData });
    return { created: false };
  }

  await db.collection("conversations").add({
    data: {
      ownerId,
      targetId,
      targetUserInfo: targetUserInfo || {},
      lastMessage,
      updateTime,
      unread: unreadOnCreate || 0,
    },
  });
  return { created: true };
};

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const ownerOpenid = wxContext.OPENID;

  const action = event?.action || "send";
  const targetId = event?.targetId;

  if (!targetId) {
    return { success: false, error: "缺少必要参数: targetId" };
  }

  if (action === "read") {
    await db
      .collection("conversations")
      .where({ ownerId: ownerOpenid, targetId })
      .update({
        data: {
          unread: 0,
          updateTime: db.serverDate(),
        },
      });
    return { success: true };
  }

  const lastMessage = String(event?.lastMessage || "").trim();
  if (!lastMessage) {
    return { success: false, error: "缺少必要参数: lastMessage" };
  }

  const [senderUserInfoFromDb, targetUserInfoFromDb] = await Promise.all([
    getUserInfoByOpenid(ownerOpenid).catch(() => null),
    getUserInfoByOpenid(targetId).catch(() => null),
  ]);

  const senderUserInfo = senderUserInfoFromDb || event?.userInfo || {};
  const targetUserInfo = targetUserInfoFromDb || {};
  const updateTime = db.serverDate();

  await Promise.all([
    upsertConversation({
      ownerId: ownerOpenid,
      targetId,
      targetUserInfo,
      lastMessage,
      updateTime,
      unreadOnUpdate: { unread: 0 },
      unreadOnCreate: 0,
    }),
    upsertConversation({
      ownerId: targetId,
      targetId: ownerOpenid,
      targetUserInfo: senderUserInfo,
      lastMessage,
      updateTime,
      unreadOnUpdate: { unread: _.inc(1) },
      unreadOnCreate: 1,
    }),
  ]);

  return { success: true };
};

