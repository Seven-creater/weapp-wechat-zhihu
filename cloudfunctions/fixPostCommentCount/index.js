// 修复帖子评论数统计
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { postId } = event;
    
    // 如果提供了 postId，只修复该帖子
    if (postId) {
      return await fixSinglePost(postId);
    }
    
    // 否则修复所有帖子
    return await fixAllPosts();
  } catch (err) {
    console.error('修复评论数失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};

// 修复单个帖子
async function fixSinglePost(postId) {
  try {
    // 查询该帖子的主评论数（不包括回复）
    const commentRes = await db.collection('comments')
      .where({
        postId: postId,
        parentId: '' // 只统计主评论
      })
      .count();
    
    const correctCount = commentRes.total;
    
    // 更新帖子的评论数
    await db.collection('posts')
      .doc(postId)
      .update({
        data: {
          'stats.comment': correctCount
        }
      });
    
    return {
      success: true,
      postId: postId,
      commentCount: correctCount,
      message: `帖子评论数已更新为 ${correctCount}`
    };
  } catch (err) {
    console.error('修复单个帖子失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// 修复所有帖子
async function fixAllPosts() {
  try {
    // 获取所有帖子
    const postsRes = await db.collection('posts')
      .field({ _id: true })
      .get();
    
    const posts = postsRes.data || [];
    const results = [];
    
    // 逐个修复
    for (const post of posts) {
      const result = await fixSinglePost(post._id);
      results.push(result);
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      success: true,
      total: posts.length,
      successCount: successCount,
      failedCount: posts.length - successCount,
      results: results
    };
  } catch (err) {
    console.error('批量修复失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

