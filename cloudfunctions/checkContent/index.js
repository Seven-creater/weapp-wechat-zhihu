const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { type, value } = event;

  try {
    let result = null;

    // 1. 文本检测
    if (type === "text") {
      result = await cloud.openapi.security.msgSecCheck({
        content: value,
      });
    }
    // 2. 图片检测
    else if (type === "image") {
      result = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: "image/png",
          value: Buffer.from(value),
        },
      });
    }

    // 3. 这里的逻辑很关键：
    // 如果上面没有抛出错误，说明微信认为"可能"没问题。
    // 但为了保险，我们可以检查 result.errCode（通常是0）
    if (result && result.errCode === 0) {
      return { code: 0, msg: "检测通过", data: result };
    } else {
      // 理论上不会走到这，因为违规通常直接抛错
      return { code: -1, msg: "内容疑似违规", data: result };
    }
  } catch (err) {
    // ============================================
    // 🛑 捕获违规！微信发现违规会直接抛错！
    // ============================================
    console.error("安全检测拦截:", err);

    // 错误码 87014 代表内容含有违法违规信息
    if (err.errCode === 87014) {
      return { code: -1, msg: "内容包含敏感信息，禁止发布", err: err };
    }

    // 其他错误（如调用频率限制、系统错误等），也暂时阻断以防万一
    return { code: -2, msg: "安全检测服务异常", err: err };
  }
};
