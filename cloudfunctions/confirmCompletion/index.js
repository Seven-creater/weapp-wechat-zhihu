// 云函数：confirmCompletion
// 发帖者或社区工作者确认项目完工
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { postId, afterImages, feedback, rating } = event;

    // 验证参数
    if (!postId) {
      return {
        success: false,
        error: '参数错误：缺少帖子ID'
      };
    }

    // 1. 获取帖子信息
    const postRes = await db.collection('posts').doc(postId).get();
    if (!postRes.data) {
      return {
        success: false,
        error: '帖子不存在'
      };
    }

    const post = postRes.data;

    // 2. 验证权限（发帖者或社区工作者可以确认）
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    const user = userRes.data && userRes.data[0];
    
    const canConfirm = 
      (post._openid === openid) ||  // 发帖者
      (user && user.userType === 'communityWorker');  // 社区工作者

    if (!canConfirm) {
      return {
        success: false,
        error: '仅发帖者或社区工作者可以确认完工'
      };
    }

    // 3. 检查帖子状态
    if (post.status === 'completed') {
      return {
        success: false,
        error: '该项目已确认完工'
      };
    }

    if (post.status !== 'in_progress') {
      return {
        success: false,
        error: '该项目尚未开始施工'
      };
    }

    // 4. 构建完工验收信息
    const completion = {
      confirmedBy: openid,
      confirmedByType: user?.userType || 'normal',
      confirmedByName: user?.userInfo?.nickName || '用户',
      confirmedAt: new Date().toISOString(),
      afterImages: afterImages || [],
      feedback: feedback || '',
      rating: rating || 5
    };

    // 5. 更新帖子状态为已完成，并移至案例库
    await db.collection('posts').doc(postId).update({
      data: {
        status: 'completed',
        isCase: true,  // 🔥 自动移至案例库
        completion: completion,
        updateTime: db.serverDate()
      }
    });

    // 6. 更新施工项目状态
    if (post.constructionProject && post.constructionProject.projectId) {
      await db.collection('construction_projects')
        .doc(post.constructionProject.projectId)
        .update({
          data: {
            status: 'completed',
            'plan.actualEndDate': new Date().toISOString(),
            completion: completion,
            updateTime: db.serverDate()
          }
        });
    }

    console.log('✅ 项目已确认完工:', postId, '确认人:', openid);

    return {
      success: true,
      message: '项目已确认完工，已移至案例库',
      completion: completion
    };

  } catch (err) {
    console.error('确认完工失败:', err);
    return {
      success: false,
      error: err.message || '确认失败，请稍后重试'
    };
  }
};



