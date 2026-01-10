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
  const { commentId, postId } = event;

  if (!commentId || !postId) {
    return { success: false, error: 'commentId and postId required' };
  }

  try {
    const commentRes = await db.collection('comments').doc(commentId).get();
    const comment = commentRes.data;

    if (!comment || comment._openid !== openid) {
      return { success: false, error: 'permission denied' };
    }

    // 找到需要删除的回复
    const repliesRes = await db
      .collection('comments')
      .where({ parentId: commentId })
      .get();

    const replyIds = (repliesRes.data || []).map((item) => item._id);
    const allIds = [commentId].concat(replyIds);

    // 删除评论与回复
    await db
      .collection('comments')
      .where(db.command.or(allIds.map((id) => ({ _id: id }))))
      .remove();

    // 删除评论相关 actions
    await db
      .collection('actions')
      .where(
        db.command.or([
          { type: 'like_comment', targetId: db.command.in(allIds) },
          { type: 'like_comment', postId: db.command.in(allIds) }
        ])
      )
      .remove();

    // 回写 posts 统计
    const decrement = allIds.length * -1;
    await db.collection('posts').doc(postId).update({
      data: {
        'stats.comment': db.command.inc(decrement)
      }
    });

    return { success: true, removed: allIds.length };
  } catch (err) {
    console.error('deleteComment error:', err);
    return { success: false, error: err.message };
  }
};
