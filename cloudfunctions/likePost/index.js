// 占位文件 - 此云函数已废弃
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  return {
    success: false,
    error: '此云函数已废弃，点赞功能请使用 toggleInteraction'
  };
};
