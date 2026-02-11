// 云函数：addDesignerSolution
// 设计者为帖子添加设计方案
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
    const { postId, optimizedPlan, drawings, optimizedCost, improvements } = event;

    // 验证参数
    if (!postId || !optimizedPlan) {
      return {
        success: false,
        error: '参数错误：缺少帖子ID或方案内容'
      };
    }

    // 1. 验证用户是设计者
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userRes.data[0];
    if (user.userType !== 'designer') {
      return {
        success: false,
        error: '仅设计者可以添加设计方案'
      };
    }

    // 2. 获取帖子信息
    const postRes = await db.collection('posts').doc(postId).get();
    if (!postRes.data) {
      return {
        success: false,
        error: '帖子不存在'
      };
    }

    const post = postRes.data;

    // 3. 检查帖子状态（只有待处理的帖子才能添加方案）
    if (post.status !== 'pending') {
      return {
        success: false,
        error: '该帖子已有施工方接单，无法添加设计方案'
      };
    }

    // 4. 构建设计方案数据
    const designerSolution = {
      designerId: openid,
      designerName: user.userInfo?.nickName || '设计者',
      designerOrg: user.profile?.organization || '',
      addedAt: new Date().toISOString(),
      optimizedPlan: optimizedPlan,
      drawings: drawings || [],
      optimizedCost: optimizedCost || 0,
      improvements: improvements || [],
      likes: 0,
      isSelected: false
    };

    // 5. 添加方案到帖子
    await db.collection('posts').doc(postId).update({
      data: {
        designerSolutions: _.push(designerSolution),
        updateTime: db.serverDate()
      }
    });

    console.log('✅ 设计者方案已添加:', openid, '帖子ID:', postId);

    return {
      success: true,
      message: '设计方案已添加',
      solution: designerSolution
    };

  } catch (err) {
    console.error('添加设计方案失败:', err);
    return {
      success: false,
      error: err.message || '添加失败，请稍后重试'
    };
  }
};



