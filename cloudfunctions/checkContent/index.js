// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 云函数入口函数
exports.main = async (event, context) => {
  const { type, value } = event;
  
  try {
    if (type === 'text') {
      // 文本内容安全检测
      const result = await cloud.openapi.security.msgSecCheck({
        content: value
      });
      
      return {
        code: result.errCode === 0 ? 0 : -1,
        msg: result.errCode === 0 ? 'ok' : '内容包含违规信息',
        data: result
      };
    } else if (type === 'image') {
      // 图片内容安全检测
      const result = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/png',
          value: Buffer.from(value, 'base64')
        }
      });
      
      return {
        code: result.errCode === 0 ? 0 : -1,
        msg: result.errCode === 0 ? 'ok' : '图片包含违规信息',
        data: result
      };
    } else {
      return {
        code: -1,
        msg: '不支持的检测类型'
      };
    }
  } catch (err) {
    console.error('内容安全检测失败:', err);
    return {
      code: -1,
      msg: '检测服务异常',
      error: err.message
    };
  }
};
