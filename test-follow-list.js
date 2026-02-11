// 测试 getFollowList 云函数
// 在微信开发者工具的控制台中运行

console.log('🔍 开始测试 getFollowList 云函数...');

// 测试查询粉丝列表
wx.cloud.callFunction({
  name: 'getFollowList',
  data: {
    type: 'followers'
  }
}).then(res => {
  console.log('✅ 查询粉丝列表成功:', res);
  console.log('数据:', res.result);
}).catch(err => {
  console.error('❌ 查询粉丝列表失败:', err);
  console.error('错误详情:', JSON.stringify(err));
});

// 测试查询关注列表
wx.cloud.callFunction({
  name: 'getFollowList',
  data: {
    type: 'following'
  }
}).then(res => {
  console.log('✅ 查询关注列表成功:', res);
  console.log('数据:', res.result);
}).catch(err => {
  console.error('❌ 查询关注列表失败:', err);
  console.error('错误详情:', JSON.stringify(err));
});

