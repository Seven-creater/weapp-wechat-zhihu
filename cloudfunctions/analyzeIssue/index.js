// 云函数入口文件 - 使用外部 AI API 进行无障碍设施诊断
const cloud = require("wx-server-sdk");
const axios = require("axios");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

// 云函数入口函数
exports.main = async (event, context) => {
  const { fileID, imageUrl, location } = event;

  if (!fileID && !imageUrl) {
    return {
      success: false,
      error: "缺少图片参数（需要 fileID 或 imageUrl）",
    };
  }

  try {
    let accessibleImageUrl = imageUrl;

    // 如果传入的是 fileID，需要转换为可访问的 URL
    if (fileID && !imageUrl) {
      // 方法1：使用云存储临时URL
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: [fileID],
        });

        if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
          const result = tempUrlResult.fileList[0];
          if (result.tempFileURL) {
            accessibleImageUrl = result.tempFileURL;
            console.log("获取临时URL成功:", accessibleImageUrl);
          } else {
            throw new Error("无法获取临时URL");
          }
        } else {
          throw new Error("临时URL结果为空");
        }
      } catch (urlErr) {
        console.error("获取临时URL失败:", urlErr);
        // 备用方案：使用fileID转换
        const envId = process.env.WXENV || "your-env-id";
        accessibleImageUrl = fileID.replace(
          "cloud://",
          `https://${envId}.cloud.tcb.qcloud.la/`,
        );
        console.log("使用备用URL:", accessibleImageUrl);
      }
    }

    if (!accessibleImageUrl) {
      throw new Error("无法获取图片访问地址");
    }

    let aiSolution = "";
    let mode = "fallback";
    try {
      const aiResult = await analyzeWithAI(accessibleImageUrl, location);
      aiSolution = normalizeSolution(aiResult, location);
      mode = "ai";
    } catch (err) {
      aiSolution = buildFallbackSolution(location);
      mode = "fallback";
    }

    return {
      success: true,
      aiSolution,
      mode,
    };
  } catch (err) {
    console.error("AI分析失败:", err);

    // 返回友好的错误信息
    let errorMessage = "AI分析服务暂时不可用，请稍后重试";

    if (err.response) {
      // API 返回的错误
      console.error("API错误响应:", err.response.data);
      errorMessage = `AI分析失败：${
        err.response.data?.error?.message || err.message
      }`;
    } else if (err.message) {
      errorMessage = `AI分析失败：${err.message}`;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

async function analyzeWithAI(imageUrl, location) {
  const url = process.env.AI_DIAGNOSIS_URL;
  const apiKey = process.env.AI_API_KEY;
  if (!url) {
    throw new Error("AI_DIAGNOSIS_URL not configured");
  }

  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await axios.post(
    url,
    {
      imageUrl,
      location: location || null,
    },
    {
      headers,
      timeout: 20000,
    }
  );

  return response.data;
}

function normalizeSolution(aiResult, location) {
  if (typeof aiResult === "string" && aiResult.trim()) return aiResult.trim();
  if (aiResult && typeof aiResult === "object") {
    const json = JSON.stringify(aiResult, null, 2);
    if (json && json.trim()) return json.trim();
  }
  return buildFallbackSolution(location);
}

function buildFallbackSolution(location) {
  const address =
    (location && (location.formattedAddress || location.address)) || "";
  const loc =
    location && typeof location.latitude === "number" && typeof location.longitude === "number"
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : "";

  const lines = [
    "诊断报告（自动生成-待复核）",
    "",
    address ? `位置：${address}` : "",
    loc ? `坐标：${loc}` : "",
    "",
    "可能问题类型：",
    "- 坡道缺失/坡度过大",
    "- 通道被占用/宽度不足",
    "- 门槛过高/无扶手",
    "- 无障碍卫生间不可用",
    "- 电梯不可达/按钮不便操作",
    "",
    "对轮椅使用者的影响：",
    "- 可能无法通过或存在侧翻风险",
    "- 需要绕行导致路程显著增加",
    "",
    "建议处置：",
    "- 先设置临时警示标识并清理占道障碍",
    "- 记录尺寸（坡度/宽度/高度）用于后续方案生成",
    "- 如涉及公共设施，建议同步社区管理员/物业",
  ].filter(Boolean);

  return lines.join("\n");
}
