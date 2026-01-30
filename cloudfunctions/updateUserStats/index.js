// cloudfunctions/updateUserStats/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, followerId, targetId } = event;
  
  try {
    if (action === 'follow') {
      // 🔥 更新关注者的关注数+1（确保 stats 字段存在）
      await updateUserStat(followerId, 'followingCount', 1);
      
      // 🔥 更新被关注者的粉丝数+1（确保 stats 字段存在）
      await updateUserStat(targetId, 'followersCount', 1);
      
      // 检查是否互相关注
      const reverseFollow = await db.collection('follows').where({
        followerId: targetId,
        targetId: followerId
      }).get();
      
      if (reverseFollow.data.length > 0) {
        // 更新为互相关注
        await db.collection('follows').where({
          followerId: followerId,
          targetId: targetId
        }).update({
          data: {
            isMutual: true
          }
        });
        
        await db.collection('follows').where({
          followerId: targetId,
          targetId: followerId
        }).update({
          data: {
            isMutual: true
          }
        });
      }
      
      return { success: true, message: '关注成功' };
      
    } else if (action === 'unfollow') {
      // 🔥 更新关注者的关注数-1
      await updateUserStat(followerId, 'followingCount', -1);
      
      // 🔥 更新被关注者的粉丝数-1
      await updateUserStat(targetId, 'followersCount', -1);
      
      // 更新对方的互相关注状态
      await db.collection('follows').where({
        followerId: targetId,
        targetId: followerId
      }).update({
        data: {
          isMutual: false
        }
      });
      
      return { success: true, message: '取消关注成功' };
    }
    
    return { success: false, error: '未知操作' };
    
  } catch (err) {
    console.error('更新统计失败:', err);
    return { success: false, error: err.message };
  }
};

// 🔥 安全地更新用户统计数据
async function updateUserStat(openid, field, increment) {
  try {
    // 先查询用户记录
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get();
    
    if (userRes.data.length === 0) {
      console.log(`用户 ${openid} 不存在，跳过更新`);
      return;
    }
    
    const user = userRes.data[0];
    const stats = user.stats || {};
    
    // 计算新值（确保不会小于0）
    const currentValue = stats[field] || 0;
    const newValue = Math.max(0, currentValue + increment);
    
    console.log(`更新用户 ${openid} 的 ${field}: ${currentValue} -> ${newValue}`);
    
    // 更新统计数据
    await db.collection('users').where({
      _openid: openid
    }).update({
      data: {
        [`stats.${field}`]: newValue
      }
    });
    
    return { success: true };
    
  } catch (err) {
    console.error(`更新用户 ${openid} 的 ${field} 失败:`, err);
    throw err;
  }
}

