// 第二位管理员专用诊断脚本
// 请用第二位管理员账号登录后，在控制台运行

console.log('🔍 开始诊断第二位管理员的问题...\n');

// 1. 确认当前登录的账号
const currentOpenid = getApp().globalData.openid || wx.getStorageSync('openid');
console.log('📱 当前登录的 openid:', currentOpenid);
console.log('🎯 第二位管理员 openid: oOJhu3T9Us9TAnibhfctmyRw2Urc');
console.log('是否匹配:', currentOpenid === 'oOJhu3T9Us9TAnibhfctmyRw2Urc');

// 2. 测试 getCertificationApplications 云函数
console.log('\n📋 测试 getCertificationApplications 云函数...');
wx.cloud.callFunction({
  name: 'getCertificationApplications',
  data: {
    status: 'pending',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  console.log('\n✅ 云函数调用成功');
  console.log('完整返回结果:', JSON.stringify(res.result, null, 2));
  
  if (res.result.success) {
    console.log('✅ 权限验证通过');
    console.log('返回的申请数量:', res.result.applications.length);
    console.log('total:', res.result.total);
    console.log('hasMore:', res.result.hasMore);
    
    if (res.result.applications.length > 0) {
      console.log('\n📋 申请列表:');
      res.result.applications.forEach((app, index) => {
        console.log(`${index + 1}. ${app.nickName} - ${app.userTypeLabel}`);
      });
    } else {
      console.log('⚠️ 申请列表为空！');
    }
  } else {
    console.error('❌ 权限验证失败:', res.result.error);
  }
}).catch(err => {
  console.error('\n❌ 云函数调用失败');
  console.error('错误信息:', err);
});

// 3. 测试 getCertificationStats 云函数
console.log('\n📊 测试 getCertificationStats 云函数...');
wx.cloud.callFunction({
  name: 'getCertificationStats',
  data: {}
}).then(res => {
  console.log('\n✅ 统计云函数调用成功');
  console.log('统计结果:', JSON.stringify(res.result, null, 2));
}).catch(err => {
  console.error('\n❌ 统计云函数调用失败');
  console.error('错误信息:', err);
});

console.log('\n⏳ 等待云函数返回结果...');

