// 检查第二位管理员的权限状态
// 在微信开发者工具的控制台中运行

wx.cloud.callFunction({
  name: 'getUserInfo',
  data: {
    targetId: 'oOJhu3T9Us9TAnibhfctmyRw2Urc'
  }
}).then(res => {
  console.log('第二位管理员的用户信息:', res.result);
  console.log('是否有管理员标识:', res.result.data.isAdmin);
  console.log('权限列表:', res.result.data.permissions);
}).catch(err => {
  console.error('查询失败:', err);
});

