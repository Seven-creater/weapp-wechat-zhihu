// 临时调试脚本 - 直接在控制台运行
// 这个脚本会绕过所有权限检查，直接显示数据库中的待审核申请

console.log('🔍 开始查询所有待审核申请...');

const db = wx.cloud.database();

// 查询所有待审核的认证申请
db.collection('users')
  .where({
    'certificationApplication.status': 'pending'
  })
  .get()
  .then(res => {
    console.log('✅ 查询成功！');
    console.log('待审核申请总数:', res.data.length);
    
    if (res.data.length > 0) {
      console.log('\n📋 待审核申请列表:');
      res.data.forEach((user, index) => {
        const app = user.certificationApplication;
        console.log(`\n${index + 1}. ${user.userInfo?.nickName || '未知用户'}`);
        console.log('   用户ID:', user._id);
        console.log('   OpenID:', user._openid);
        console.log('   申请类型:', app.type);
        console.log('   申请时间:', new Date(app.applyTime).toLocaleString());
        console.log('   详细信息:', app.info);
      });
    } else {
      console.log('⚠️ 没有待审核的申请');
    }
  })
  .catch(err => {
    console.error('❌ 查询失败:', err);
    console.log('错误信息:', err.errMsg);
    
    if (err.errMsg && err.errMsg.includes('permission')) {
      console.log('\n⚠️ 这是权限问题！');
      console.log('解决方案：需要使用云函数查询');
      console.log('请确认已上传以下云函数：');
      console.log('  - getCertificationApplications');
      console.log('  - reviewCertification');
    }
  });

