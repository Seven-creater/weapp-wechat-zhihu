// 万能测试脚本 - 检查认证申请和管理员权限
// 在微信开发者工具的控制台中运行

console.log('🔍 开始全面检查...');

// 1. 检查当前用户的 openid
const currentOpenid = getApp().globalData.openid || wx.getStorageSync('openid');
console.log('📱 当前用户 openid:', currentOpenid);

// 2. 检查是否是第二位管理员
const targetAdminOpenid = 'oOJhu3T9Us9TAnibhfctmyRw2Urc';
console.log('🎯 目标管理员 openid:', targetAdminOpenid);
console.log('是否匹配:', currentOpenid === targetAdminOpenid);

// 3. 直接调用云函数查询认证申请
console.log('\n📋 测试1: 调用 getCommunityWorkerCertApplications');
wx.cloud.callFunction({
  name: 'getCommunityWorkerCertApplications',
  data: {
    status: 'pending',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  console.log('✅ getCommunityWorkerCertApplications 返回:', res.result);
  if (res.result.success) {
    console.log('待审核数量:', res.result.applications.length);
    console.log('申请列表:', res.result.applications);
  } else {
    console.error('❌ 错误:', res.result.error);
  }
}).catch(err => {
  console.error('❌ 调用失败:', err);
});

// 4. 测试查询所有类型的认证申请
console.log('\n📋 测试2: 调用 getCertificationApplications');
wx.cloud.callFunction({
  name: 'getCertificationApplications',
  data: {
    status: 'pending',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  console.log('✅ getCertificationApplications 返回:', res.result);
  if (res.result.success) {
    console.log('待审核数量:', res.result.applications.length);
    console.log('申请列表:', res.result.applications);
  } else {
    console.error('❌ 错误:', res.result.error);
  }
}).catch(err => {
  console.error('❌ 调用失败:', err);
});

// 5. 直接查询数据库（如果有权限）
console.log('\n📋 测试3: 直接查询数据库');
const db = wx.cloud.database();
db.collection('users')
  .where({
    'certificationApplication.status': 'pending'
  })
  .count()
  .then(res => {
    console.log('✅ 数据库中待审核申请数量:', res.total);
  })
  .catch(err => {
    console.log('⚠️ 数据库查询失败（可能是权限问题）:', err.errMsg);
  });

// 6. 检查第二位管理员的用户信息
console.log('\n📋 测试4: 检查管理员用户信息');
wx.cloud.callFunction({
  name: 'getUserInfo',
  data: {
    targetId: targetAdminOpenid
  }
}).then(res => {
  console.log('✅ 管理员用户信息:', res.result);
  if (res.result.success) {
    console.log('isAdmin:', res.result.data.isAdmin);
    console.log('permissions:', res.result.data.permissions);
  }
}).catch(err => {
  console.error('❌ 查询失败:', err);
});

console.log('\n✅ 所有测试已启动，请查看上方输出结果');

