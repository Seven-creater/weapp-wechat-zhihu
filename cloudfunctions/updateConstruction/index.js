const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const nowDateString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { solutionId, action, team, note, afterImg } = event || {};
  if (!solutionId || !action) {
    return { success: false, error: "缺少必要参数: solutionId, action" };
  }

  const validActions = ["start", "advance", "complete", "publishCase"];
  if (!validActions.includes(action)) {
    return { success: false, error: "无效 action" };
  }

  try {
    const solutionRes = await db.collection("solutions").doc(solutionId).get();
    const solution = solutionRes.data;
    if (!solution) return { success: false, error: "方案不存在" };
    if (solution._openid && solution._openid !== openid) {
      return { success: false, error: "无权限操作该方案" };
    }

    const current = solution.construction || {};
    const timeline = Array.isArray(current.timeline) ? current.timeline : [];

    if (action === "start") {
      if (!team || !team.id || !team.name) {
        return { success: false, error: "缺少 team 信息" };
      }

      const startTimeline = [
        { title: "发布需求", date: nowDateString(), done: true },
        { title: "施工方接单", date: "待定", done: false },
        { title: "上门勘测", date: "待定", done: false },
        { title: "进场施工", date: "待定", done: false },
        { title: "验收交付", date: "待定", done: false },
      ];

      await db
        .collection("solutions")
        .doc(solutionId)
        .update({
          data: {
            construction: {
              status: "active",
              team,
              timeline: startTimeline,
              note: note || "",
              startedAt: db.serverDate(),
              updatedAt: db.serverDate(),
            },
            status: "施工中",
            updateTime: db.serverDate(),
          },
        });

      return { success: true };
    }

    if (action === "advance") {
      const nextTimeline = timeline.map((item) => ({ ...item }));
      const idx = nextTimeline.findIndex((x) => !x.done);
      if (idx >= 0) {
        nextTimeline[idx].done = true;
        nextTimeline[idx].date =
          nextTimeline[idx].date === "待定"
            ? nowDateString()
            : nextTimeline[idx].date;
      }

      await db
        .collection("solutions")
        .doc(solutionId)
        .update({
          data: {
            "construction.timeline": nextTimeline,
            "construction.updatedAt": db.serverDate(),
            updateTime: db.serverDate(),
          },
        });

      return { success: true };
    }

    if (action === "complete") {
      const finalTimeline = timeline.map((item) => ({ ...item, done: true }));
      const fixedTimeline = finalTimeline.length
        ? finalTimeline.map((it, i) => ({
            ...it,
            date: it.date === "待定" ? nowDateString() : it.date,
          }))
        : [
            { title: "发布需求", date: nowDateString(), done: true },
            { title: "施工方接单", date: nowDateString(), done: true },
            { title: "上门勘测", date: nowDateString(), done: true },
            { title: "进场施工", date: nowDateString(), done: true },
            { title: "验收交付", date: nowDateString(), done: true },
          ];

      const update = {
        "construction.status": "completed",
        "construction.timeline": fixedTimeline,
        "construction.updatedAt": db.serverDate(),
        status: "已完成",
        updateTime: db.serverDate(),
      };

      if (afterImg) {
        update.afterImg = afterImg;
        update.imageUrl = afterImg;
      }

      await db.collection("solutions").doc(solutionId).update({ data: update });
      return { success: true };
    }

    if (action === "publishCase") {
      const before =
        solution.beforeImg || solution.imageUrl || solution.coverImage || "";
      const after = solution.afterImg || "";
      const images = [before, after].filter(Boolean);

      const contentParts = [];
      if (solution.title) contentParts.push(solution.title);
      if (solution.aiAnalysis)
        contentParts.push(`AI诊断：${solution.aiAnalysis}`);
      if (solution.plan && solution.plan.planDesc)
        contentParts.push(`方案：${solution.plan.planDesc}`);
      const content = contentParts.join("\n");

      const postData = {
        content,
        images,
        type: "case",
        category: solution.category || "",
        sourceSolutionId: solutionId,
        stats: { view: 0, like: 0, comment: 0 },
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        userInfo: solution.userInfo || null,
      };

      const addRes = await db.collection("posts").add({ data: postData });
      await db
        .collection("solutions")
        .doc(solutionId)
        .update({
          data: {
            casePostId: addRes._id,
            updateTime: db.serverDate(),
          },
        });

      return { success: true, postId: addRes._id };
    }

    return { success: false, error: "未知操作" };
  } catch (err) {
    return { success: false, error: err.message || "操作失败" };
  }
};
