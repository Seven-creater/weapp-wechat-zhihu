// 云函数：fixUserBadge
// 万能修复脚本：自动根据 userType 设置正确的徽章
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 用户类型徽章配置
const BADGE_CONFIG = {
  normal: { color: '#6B7280', icon: '👤', text: '用户' },
  designer: { color: '#10B981', icon: '🟢', text: '设计者' },
  contractor: { color: '#3B82F6', icon: '🔵', text: '施工方' },
  government: { color: '#EF4444', icon: '🔴', text: '政府' }
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { targetOpenid, fixAll } = event;

  try {
    let usersToFix = [];

    if (fixAll) {
      // 修复所有用户
      console.log('🔧 开始修复所有用户的徽章...');
      const allUsers = await db.collection('users').get();
      usersToFix = allUsers.data;
    } else if (targetOpenid) {
      // 修复指定用户
      console.log('🔧 修复指定用户:', targetOpenid);
      const userQuery = await db.collection('users')
        .where({
          _openid: targetOpenid
        })
        .get();
      
      if (userQuery.data.length === 0) {
        // 尝试用 openid 查询
        const userQuery2 = await db.collection('users')
          .where({
            openid: targetOpenid
          })
          .get();
        usersToFix = userQuery2.data;
      } else {
        usersToFix = userQuery.data;
      }
    } else {
      // 修复当前用户
      console.log('🔧 修复当前用户:', wxContext.OPENID);
      const userQuery = await db.collection('users')
        .where({
          _openid: wxContext.OPENID
        })
        .get();
      usersToFix = userQuery.data;
    }

    if (usersToFix.length === 0) {
      return {
        success: false,
        error: '未找到需要修复的用户'
      };
    }

    console.log(`📊 找到 ${usersToFix.length} 个用户需要修复`);

    let fixedCount = 0;
    const results = [];

    for (const user of usersToFix) {
      const userType = user.userType || 'normal';
      const correctBadge = BADGE_CONFIG[userType] || BADGE_CONFIG.normal;
      
      // 检查徽章是否正确
      const currentBadge = user.badge || {};
      const needsFix = !currentBadge.color || 
                       !currentBadge.icon || 
                       !currentBadge.text ||
                       currentBadge.color !== correctBadge.color ||
                       currentBadge.icon !== correctBadge.icon ||
                       currentBadge.text !== correctBadge.text;

      if (needsFix) {
        console.log(`🔧 修复用户: ${user.userInfo?.nickName}, 类型: ${userType}`);
        
        try {
          await db.collection('users')
            .doc(user._id)
            .update({
              data: {
                badge: correctBadge,
                userTypeLabel: correctBadge.text
              }
            });
          
          fixedCount++;
          results.push({
            openid: user._openid,
            nickName: user.userInfo?.nickName,
            userType: userType,
            badge: correctBadge,
            status: 'fixed'
          });
          
          console.log(`✅ 修复成功: ${user.userInfo?.nickName}`);
        } catch (err) {
          console.error(`❌ 修复失败: ${user.userInfo?.nickName}`, err);
          results.push({
            openid: user._openid,
            nickName: user.userInfo?.nickName,
            userType: userType,
            error: err.message,
            status: 'failed'
          });
        }
      } else {
        console.log(`✓ 跳过: ${user.userInfo?.nickName} (徽章已正确)`);
        results.push({
          openid: user._openid,
          nickName: user.userInfo?.nickName,
          userType: userType,
          badge: currentBadge,
          status: 'skipped'
        });
      }
    }

    console.log(`✅ 修复完成！共修复 ${fixedCount} 个用户`);

    return {
      success: true,
      message: `成功修复 ${fixedCount} 个用户`,
      total: usersToFix.length,
      fixed: fixedCount,
      results: results
    };

  } catch (err) {
    console.error('修复失败:', err);
    return {
      success: false,
      error: err.message || '修复失败'
    };
  }
};

