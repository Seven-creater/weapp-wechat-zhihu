// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { postId } = event;

  if (!postId) {
    return { success: false, error: 'postId required' };
  }

  try {
    // 检查是否是管理员
    const adminOpenids = [
      'oOJhu3QmRKlk8Iuu87G6ol0IrDyQ',  // 第一位管理员
      'oOJhu3T9Us9TAnibhfctmyRw2Urc'   // 第二位管理员
    ];
    const isAdmin = adminOpenids.includes(openid);

    const postRes = await db.collection('posts').doc(postId).get();
    const post = postRes.data;

    // 管理员可以删除任何帖子，普通用户只能删除自己的帖子
    if (!post || (!isAdmin && post._openid !== openid)) {
      return { success: false, error: 'permission denied' };
    }

    await db.collection('posts').doc(postId).remove();

    // 删除评论
    await db.collection('comments').where({ postId }).remove();

    // 删除相关 actions
    await db
      .collection('actions')
      .where(
        db.command.or([
          { type: 'like_post', targetId: postId },
          { type: 'like_post', postId: postId },
          { type: 'collect_post', targetId: postId },
          { type: 'collect_post', postId: postId }
        ])
      )
      .remove();

    return { success: true };
  } catch (err) {
    console.error('deletePost error:', err);
    return { success: false, error: err.message };
  }
};
