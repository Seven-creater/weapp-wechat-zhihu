// 云函数入口文件 - 使用阿里云百炼 Qwen-VL-Max 进行图片分析
const cloud = require("wx-server-sdk");
const axios = require("axios");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

// 阿里云百炼 API 配置
// API Key：优先从环境变量读取，否则使用默认值
const DASHSCOPE_API_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL_NAME = "qwen-vl-max";

// 阿里云 API Key（请勿泄露给他人）
const DEFAULT_API_KEY = "sk-2f0c1ef0d3d343e39e893c47211ad541";

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
          `https://${envId}.cloud.tcb.qcloud.la/`
        );
        console.log("使用备用URL:", accessibleImageUrl);
      }
    }

    if (!accessibleImageUrl) {
      throw new Error("无法获取图片访问地址");
    }

    // 调用 AI 服务进行分析
    const aiSolution = await analyzeWithQwenVL(accessibleImageUrl, location);

    return {
      success: true,
      aiSolution: aiSolution,
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

/**
 * 使用 Qwen-VL-Max 分析图片
 * @param {string} imageUrl - 图片的 HTTP URL
 * @param {object} location - 位置信息
 * @returns {string} - AI分析结果
 */
async function analyzeWithQwenVL(imageUrl, location) {
  // 获取 API Key：优先从环境变量读取，否则使用默认值
  const apiKey = process.env.DASHSCOPE_API_KEY || DEFAULT_API_KEY;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    throw new Error("未配置阿里云百炼 API Key");
  }

  // 构建消息
  const messages = [
    {
      role: "system",
      content: `你是一个无障碍环境改造专家。请分析图片中的障碍问题（如台阶过高、盲道被占、路面破损、电梯缺失、无卫生间扶手等），并用简练、专业的语言给出：

1. 问题诊断：简要描述图片中存在的无障碍障碍问题
2. 改造建议：提供具体可行的改造方案
3. 预估预算：给出大致的改造预算范围

请用中文回复，保持专业但通俗易懂。`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请分析这张现场照片中的无障碍设施问题。${
            location?.address ? `位置信息：${location.address}` : ""
          }`,
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
          },
        },
      ],
    },
  ];

  // 调用阿里云百炼 API
  const response = await axios.post(
    `${DASHSCOPE_API_BASE}/chat/completions`,
    {
      model: MODEL_NAME,
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000, // 30秒超时
    }
  );

  // 解析返回结果
  if (
    response.data &&
    response.data.choices &&
    response.data.choices.length > 0
  ) {
    const content = response.data.choices[0].message?.content;

    if (content) {
      return content.trim();
    }
  }

  throw new Error("AI返回结果为空");
}
