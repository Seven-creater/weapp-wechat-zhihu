// 综合测试脚本 - 用第一个管理员账号运行
// 在微信开发者工具的控制台中运行

console.log('🔍 开始综合测试...\n');

// 1. 检查当前登录的是哪个管理员
const currentOpenid = getApp().globalData.openid || wx.getStorageSync('openid');
console.log('📱 当前登录的 openid:', currentOpenid);

if (currentOpenid === 'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ') {
  console.log('✅ 你是第一位管理员');
} else if (currentOpenid === 'oOJhu3T9Us9TAnibhfctmyRw2Urc') {
  console.log('✅ 你是第二位管理员');
} else {
  console.log('⚠️ 你不是管理员');
}

// 2. 测试云函数是否已上传并正常工作
console.log('\n📋 测试云函数...');

// 测试 getCertificationApplications
wx.cloud.callFunction({
  name: 'getCertificationApplications',
  data: {
    status: 'pending',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  console.log('\n✅ getCertificationApplications 云函数调用成功');
  console.log('返回结果:', res.result);
  
  if (res.result.success) {
    console.log('✅ 权限验证通过');
    console.log('待审核申请数量:', res.result.applications.length);
    
    if (res.result.applications.length > 0) {
      console.log('\n📋 待审核申请列表:');
      res.result.applications.forEach((app, index) => {
        console.log(`${index + 1}. ${app.nickName} - ${app.userTypeLabel}`);
        console.log('   申请时间:', app.applyTime);
      });
    } else {
      console.log('⚠️ 没有待审核的申请');
    }
  } else {
    console.error('❌ 权限验证失败:', res.result.error);
  }
}).catch(err => {
  console.error('\n❌ getCertificationApplications 云函数调用失败');
  console.error('错误信息:', err);
  console.error('可能原因: 云函数未上传或有错误');
});

// 3. 测试 getCommunityWorkerCertApplications
wx.cloud.callFunction({
  name: 'getCommunityWorkerCertApplications',
  data: {
    status: 'pending',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  console.log('\n✅ getCommunityWorkerCertApplications 云函数调用成功');
  console.log('返回结果:', res.result);
  
  if (res.result.success) {
    console.log('✅ 权限验证通过');
    console.log('待审核社区工作者申请数量:', res.result.applications.length);
  } else {
    console.error('❌ 权限验证失败:', res.result.error);
  }
}).catch(err => {
  console.error('\n❌ getCommunityWorkerCertApplications 云函数调用失败');
  console.error('错误信息:', err);
});

// 4. 检查云函数日志中的权限验证信息
console.log('\n💡 提示:');
console.log('1. 如果云函数调用失败，说明云函数未上传');
console.log('2. 如果返回"权限不足"，说明 openid 不在管理员列表中');
console.log('3. 如果返回成功但数量为0，说明数据库中确实没有待审核申请');
console.log('\n请查看上方的测试结果！');

