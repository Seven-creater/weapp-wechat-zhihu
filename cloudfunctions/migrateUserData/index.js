// cloudfunctions/migrateUserData/index.js
// 数据迁移工具 - 修复旧数据结构
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { action = 'check' } = event;
  
  try {
    if (action === 'check') {
      // 检查数据结构
      return await checkDataStructure();
    } else if (action === 'migrate') {
      // 迁移数据
      return await migrateData();
    } else if (action === 'fix') {
      // 修复单个用户数据
      const { openid } = event;
      return await fixUserData(openid);
    }
    
    return { success: false, error: '未知操作' };
    
  } catch (err) {
    console.error('操作失败:', err);
    return { success: false, error: err.message };
  }
};

// 检查数据结构
async function checkDataStructure() {
  const users = await db.collection('users').limit(100).get();
  
  const report = {
    total: users.data.length,
    correct: 0,
    needFix: 0,
    issues: []
  };
  
  users.data.forEach(user => {
    const hasUserInfo = user.userInfo && user.userInfo.nickName && user.userInfo.avatarUrl;
    const hasRedundant = user.nickName || user.avatarUrl;
    const hasStats = user.stats && typeof user.stats.followingCount === 'number';
    
    if (hasUserInfo && !hasRedundant && hasStats) {
      report.correct++;
    } else {
      report.needFix++;
      report.issues.push({
        openid: user._openid,
        problems: {
          missingUserInfo: !hasUserInfo,
          hasRedundant: hasRedundant,
          missingStats: !hasStats
        }
      });
    }
  });
  
  return {
    success: true,
    report: report
  };
}

// 迁移所有数据
async function migrateData() {
  const users = await db.collection('users').get();
  let fixed = 0;
  let failed = 0;
  
  for (const user of users.data) {
    try {
      await fixUserData(user._openid);
      fixed++;
    } catch (err) {
      console.error('修复失败:', user._openid, err);
      failed++;
    }
  }
  
  return {
    success: true,
    total: users.data.length,
    fixed: fixed,
    failed: failed
  };
}

// 修复单个用户数据
async function fixUserData(openid) {
  const userRes = await db.collection('users').where({
    _openid: openid
  }).get();
  
  if (userRes.data.length === 0) {
    throw new Error('用户不存在');
  }
  
  const user = userRes.data[0];
  
  // 构建正确的 userInfo
  const userInfo = {
    nickName: user.userInfo?.nickName || user.nickName || '未知用户',
    avatarUrl: user.userInfo?.avatarUrl || user.avatarUrl || '/images/zhi.png'
  };
  
  // 构建 stats
  const stats = user.stats || {
    followingCount: 0,
    followersCount: 0,
    likesCount: 0
  };
  
  // 更新数据
  await db.collection('users').doc(user._id).update({
    data: {
      userInfo: userInfo,
      stats: stats,
      updateTime: db.serverDate()
    }
  });
  
  // 移除冗余字段（如果存在）
  if (user.nickName || user.avatarUrl) {
    await db.collection('users').doc(user._id).update({
      data: {
        nickName: db.command.remove(),
        avatarUrl: db.command.remove()
      }
    });
  }
  
  return { success: true, openid: openid };
}

