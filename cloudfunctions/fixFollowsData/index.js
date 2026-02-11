// 云函数：fixFollowsData
// 修复旧的关注记录，将 followerId/followingId 迁移到 _openid/targetId
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 🔐 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ'  // 管理员账号
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;

  try {
    // ✅ 验证管理员权限
    if (!ADMIN_OPENIDS.includes(adminOpenid)) {
      return {
        success: false,
        error: '权限不足，仅管理员可以执行数据修复'
      };
    }

    console.log('🔧 开始修复关注数据...');

    // 1. 查询所有关注记录
    const allFollows = await db.collection('follows')
      .limit(1000)
      .get();

    console.log('📊 查询到关注记录总数:', allFollows.data.length);

    let fixedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;

    // 2. 遍历每条记录
    for (const follow of allFollows.data) {
      const hasNewFields = follow._openid && follow.targetId;
      const hasOldFields = follow.followerId && follow.followingId;

      if (hasNewFields) {
        // 已经是新格式，跳过
        skippedCount++;
        continue;
      }

      if (hasOldFields) {
        // 旧格式，需要迁移
        console.log('🔄 迁移旧记录:', follow._id);
        
        try {
          // 删除旧记录
          await db.collection('follows').doc(follow._id).remove();
          
          // 创建新记录（使用正确的字段名）
          await db.collection('follows').add({
            data: {
              _openid: follow.followerId,  // 关注者
              targetId: follow.followingId,  // 被关注者
              createTime: follow.createTime || db.serverDate(),
              isMutual: follow.isMutual || false
            }
          });
          
          fixedCount++;
          console.log('✅ 迁移成功');
        } catch (err) {
          console.error('❌ 迁移失败:', err);
        }
      } else {
        // 既没有新字段也没有旧字段，数据损坏，删除
        console.warn('⚠️ 发现损坏的记录，删除:', follow._id);
        
        try {
          await db.collection('follows').doc(follow._id).remove();
          deletedCount++;
        } catch (err) {
          console.error('❌ 删除失败:', err);
        }
      }
    }

    console.log('✅ 数据修复完成');
    console.log('📊 统计信息:');
    console.log('  - 已修复:', fixedCount);
    console.log('  - 已删除:', deletedCount);
    console.log('  - 已跳过:', skippedCount);

    return {
      success: true,
      message: '数据修复完成',
      stats: {
        total: allFollows.data.length,
        fixed: fixedCount,
        deleted: deletedCount,
        skipped: skippedCount
      }
    };

  } catch (err) {
    console.error('数据修复失败:', err);
    return {
      success: false,
      error: err.message || '数据修复失败'
    };
  }
};

