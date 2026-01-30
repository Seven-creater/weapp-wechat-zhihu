// 云函数：修复用户统计数据
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { targetId } = event;
  
  try {
    console.log('开始修复用户统计数据...');
    
    // 如果指定了 targetId，只修复该用户
    if (targetId) {
      await fixUserStats(targetId);
      return {
        success: true,
        message: `用户 ${targetId} 的统计数据已修复`
      };
    }
    
    // 否则修复所有用户
    const usersRes = await db.collection('users').get();
    const users = usersRes.data || [];
    
    console.log(`找到 ${users.length} 个用户，开始修复...`);
    
    for (const user of users) {
      await fixUserStats(user._openid);
    }
    
    return {
      success: true,
      message: `已修复 ${users.length} 个用户的统计数据`
    };
    
  } catch (err) {
    console.error('修复统计数据失败:', err);
    return {
      success: false,
      error: err.message,
      details: err
    };
  }
};

// 修复单个用户的统计数据
async function fixUserStats(openid) {
  try {
    console.log(`修复用户 ${openid} 的统计数据...`);
    
    // 1. 查询关注数（我关注的人数）
    const followingRes = await db.collection('follows').where({
      followerId: openid
    }).count();
    const followingCount = followingRes.total || 0;
    
    // 2. 查询粉丝数（关注我的人数）
    const followersRes = await db.collection('follows').where({
      targetId: openid
    }).count();
    const followersCount = followersRes.total || 0;
    
    // 3. 查询获赞数（我的帖子被点赞的总数）
    const postsRes = await db.collection('posts').where({
      _openid: openid
    }).field({
      stats: true
    }).get();
    
    const posts = postsRes.data || [];
    const likesCount = posts.reduce((sum, post) => {
      return sum + ((post.stats && post.stats.like) || 0);
    }, 0);
    
    console.log(`用户 ${openid} 统计数据:`, {
      followingCount,
      followersCount,
      likesCount
    });
    
    // 4. 更新到 users 集合
    const updateRes = await db.collection('users').where({
      _openid: openid
    }).update({
      data: {
        stats: {
          followingCount: followingCount,
          followersCount: followersCount,
          likesCount: likesCount
        }
      }
    });
    
    console.log(`用户 ${openid} 统计数据更新结果:`, updateRes);
    
    return {
      success: true,
      openid,
      stats: {
        followingCount,
        followersCount,
        likesCount
      }
    };
    
  } catch (err) {
    console.error(`修复用户 ${openid} 失败:`, err);
    throw err;
  }
}

