// 测试设置管理员的脚本
// 在微信开发者工具的控制台中运行

wx.cloud.callFunction({
  name: 'setAdmin',
  data: {
    targetOpenid: 'oOJhu3T9Us9TAnibhfctmyRw2Urc'
  }
}).then(res => {
  console.log('设置管理员成功:', res);
}).catch(err => {
  console.error('设置管理员失败:', err);
});

