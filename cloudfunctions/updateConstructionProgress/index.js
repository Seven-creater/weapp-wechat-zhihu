// 云函数：updateConstructionProgress
// 施工方更新施工进度
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
    const { projectId, progress, milestone, photos, notes } = event;

    // 验证参数
    if (!projectId) {
      return {
        success: false,
        error: '参数错误：缺少项目ID'
      };
    }

    if (progress === undefined || !milestone) {
      return {
        success: false,
        error: '参数错误：缺少进度或里程碑描述'
      };
    }

    // 1. 获取项目信息
    const projectRes = await db.collection('construction_projects').doc(projectId).get();
    if (!projectRes.data) {
      return {
        success: false,
        error: '项目不存在'
      };
    }

    const project = projectRes.data;

    // 2. 验证权限（只有该项目的施工方或社区工作者可以更新）
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    const user = userRes.data && userRes.data[0];
    
    const canUpdate = 
      (user && user.userType === 'contractor' && project.constructorId === openid) ||
      (user && user.userType === 'communityWorker');

    if (!canUpdate) {
      return {
        success: false,
        error: '无权限更新此项目'
      };
    }

    // 3. 构建里程碑数据
    const milestoneData = {
      stage: milestone,
      completedAt: new Date().toISOString(),
      photos: photos || [],
      notes: notes || '',
      updatedBy: openid,
      updatedByName: user?.userInfo?.nickName || '施工方'
    };

    // 4. 更新项目进度
    const updateData = {
      progress: progress,
      milestones: _.push(milestoneData),
      updateTime: db.serverDate()
    };

    // 如果进度达到100%，自动更新状态为已完成
    if (progress >= 100) {
      updateData.status = 'completed';
      updateData['plan.actualEndDate'] = new Date().toISOString();
    } else if (progress > 0 && project.status === 'pending') {
      // 如果是第一次更新进度，状态从pending变为in_progress
      updateData.status = 'in_progress';
      if (!project.plan.startDate) {
        updateData['plan.startDate'] = new Date().toISOString();
      }
    }

    await db.collection('construction_projects').doc(projectId).update({
      data: updateData
    });

    // 5. 同步更新帖子中的进度信息
    const postRes = await db.collection('posts').where({ 'constructionProject.projectId': projectId }).get();
    if (postRes.data && postRes.data.length > 0) {
      const post = postRes.data[0];
      
      await db.collection('posts').doc(post._id).update({
        data: {
          'constructionProject.progress': progress,
          'constructionProject.milestones': _.push(milestoneData),
          'constructionProject.status': updateData.status || project.status,
          updateTime: db.serverDate()
        }
      });
    }

    console.log('✅ 施工进度已更新:', projectId, '进度:', progress + '%');

    return {
      success: true,
      message: '施工进度已更新',
      progress: progress,
      milestone: milestoneData
    };

  } catch (err) {
    console.error('更新施工进度失败:', err);
    return {
      success: false,
      error: err.message || '更新失败，请稍后重试'
    };
  }
};



