const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildBudget = (schemeId, material, area) => {
  const safeArea = clamp(Number(area) || 0, 0, 10000);
  const base =
    schemeId === "lift" ? 5000 : schemeId === "handrail" ? 200 : 500;

  const factor =
    material === "不锈钢"
      ? 1.2
      : material === "防腐木"
        ? 1.05
        : material === "混凝土"
          ? 0.95
          : material === "防滑地砖"
            ? 1.1
            : 1;

  const materialCost = Math.round(safeArea * base * factor * 100) / 100;
  const laborCost = Math.round(materialCost * 0.4 * 100) / 100;
  const designCost = 0;
  const totalCost = Math.round((materialCost + laborCost + designCost) * 100) / 100;

  return {
    items: [
      { name: "材料费", cost: materialCost.toFixed(2) },
      { name: "人工费", cost: laborCost.toFixed(2) },
      { name: "设计费", cost: designCost.toFixed(2) },
    ],
    totalCost: totalCost.toFixed(2),
  };
};

const buildSteps = (schemeId) => {
  if (schemeId === "lift") {
    return ["现场勘测与方案确认", "设备选型与下单", "安装施工与调试", "安全验收与交付"];
  }
  if (schemeId === "handrail") {
    return ["现场测量定位", "材料准备与预制", "安装固定与防滑处理", "验收与维护说明"];
  }
  return ["现场勘测与测量", "坡道结构与防滑处理", "边缘防护与导向标识", "验收与维护说明"];
};

const buildPlanText = (schemeName, material) => {
  return `根据AI诊断与您填写的参数，推荐采用${material}材质的${schemeName}方案。该方案优先满足无障碍通行的安全性与可维护性，建议后续由施工方现场复核坡度/宽度/转弯半径等关键尺寸。`;
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const {
    issueId,
    schemeId,
    schemeName,
    material,
    area,
    diagnosis,
  } = event || {};

  if (!schemeId || !schemeName) {
    return { success: false, error: "缺少必要参数: schemeId, schemeName" };
  }

  if (!material) {
    return { success: false, error: "缺少必要参数: material" };
  }

  const budget = buildBudget(schemeId, material, area);
  const steps = buildSteps(schemeId);
  const planDesc = buildPlanText(schemeName, material);

  const plan = {
    schemeId,
    schemeName,
    material,
    area: Number(area) || 0,
    planImage: "/images/24213.jpg",
    planDesc,
    budgetItems: budget.items,
    totalCost: budget.totalCost,
    steps,
  };

  try {
    let issue = null;
    if (issueId) {
      const issueRes = await db.collection("issues").doc(issueId).get();
      issue = issueRes.data || null;
    }

    let existingSolutionId = null;
    if (issueId) {
      const sRes = await db
        .collection("solutions")
        .where({ sourceIssueId: issueId })
        .limit(1)
        .get();
      existingSolutionId = sRes.data && sRes.data[0] ? sRes.data[0]._id : null;
    }

    const titleSource =
      (issue && (issue.description || issue.address)) || `${schemeName}改造方案`;
    const title = String(titleSource).slice(0, 30);

    const beforeImg =
      (issue && (issue.imageUrl || (Array.isArray(issue.images) ? issue.images[0] : ""))) ||
      "";

    const updateData = {
      title,
      category: (issue && issue.category) || schemeName,
      status: "方案已生成",
      beforeImg,
      aiAnalysis: (issue && issue.aiSolution) || diagnosis || "",
      userSuggestion: (issue && issue.userSuggestion) || "",
      address: (issue && issue.address) || "",
      formattedAddress: (issue && issue.formattedAddress) || "",
      location: (issue && issue.location) || null,
      plan,
      updateTime: db.serverDate(),
    };

    if (existingSolutionId) {
      await db.collection("solutions").doc(existingSolutionId).update({ data: updateData });
      return { success: true, solutionId: existingSolutionId, plan };
    }

    const addData = {
      ...updateData,
      viewCount: 0,
      collectCount: 0,
      stats: { view: 0, like: 0, comment: 0, collect: 0 },
      createTime: db.serverDate(),
      _openid: openid,
      sourceIssueId: issueId || "",
    };

    const addRes = await db.collection("solutions").add({ data: addData });
    return { success: true, solutionId: addRes._id, plan };
  } catch (err) {
    return { success: false, error: err.message || "生成方案失败" };
  }
};

