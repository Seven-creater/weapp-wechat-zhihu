// 云函数入口文件 - 使用阿里云百炼 Qwen-VL-Max 进行图片分析
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 阿里云百炼 API 配置
// 请在微信开发者工具中设置环境变量：cloud.DASHSCOPE_API_KEY
const DASHSCOPE_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL_NAME = 'qwen-vl-max';

// 云函数入口函数
exports.main = async (event, context) => {
  const { imageUrl, location } = event;
  
  if (!imageUrl) {
    return {
      success: false,
      error: '缺少图片URL参数'
    };
  }
  
  try {
    // 调用 AI 服务进行分析
    const aiSolution = await analyzeWithQwenVL(imageUrl, location);
    
    return {
      success: true,
      aiSolution: aiSolution
    };
  } catch (err) {
    console.error('AI分析失败:', err);
    
    // 返回友好的错误信息
    let errorMessage = 'AI分析服务暂时不可用，请稍后重试';
    
    if (err.response) {
      // API 返回的错误
      console.error('API错误响应:', err.response.data);
      errorMessage = `AI分析失败：${err.response.data?.error?.message || err.message}`;
    } else if (err.message) {
      errorMessage = `AI分析失败：${err.message}`;
    }
    
    return {
      success: false,
      error: errorMessage
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
  // 获取 API Key（从环境变量或配置中获取）
  // 建议在云开发控制台中设置环境变量 DASHSCOPE_API_KEY
  const apiKey = process.env.DASHSCOPE_API_KEY || cloud.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    throw new Error('未配置阿里云百炼 API Key，请在云开发控制台设置环境变量 DASHSCOPE_API_KEY');
  }
  
  // 构建消息
  const messages = [
    {
      role: "system",
      content: `你是一个无障碍环境改造专家。请分析图片中的障碍问题（如台阶过高、盲道被占、路面破损、电梯缺失、无卫生间扶手等），并用简练、专业的语言给出：

1. 问题诊断：简要描述图片中存在的无障碍障碍问题
2. 改造建议：提供具体可行的改造方案
3. 预估预算：给出大致的改造预算范围

请用中文回复，保持专业但通俗易懂。`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请分析这张现场照片中的无障碍设施问题。${location?.address ? `位置信息：${location.address}` : ''}`
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl
          }
        }
      ]
    }
  ];
  
  // 调用阿里云百炼 API
  const response = await axios.post(
    `${DASHSCOPE_API_BASE}/chat/completions`,
    {
      model: MODEL_NAME,
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000 // 30秒超时
    }
  );
  
  // 解析返回结果
  if (response.data && response.data.choices && response.data.choices.length > 0) {
    const content = response.data.choices[0].message?.content;
    
    if (content) {
      return content.trim();
    }
  }
  
  throw new Error('AI返回结果为空');
}

/**
 * 将本地文件路径转换为 Base64（备用方案）
 * @param {string} filePath - 文件路径
 * @returns {string} - Base64 字符串
 */
function fileToBase64(filePath) {
  const fs = require('fs');
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
}
