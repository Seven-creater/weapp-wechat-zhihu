// cloudfunctions/updateProjectNode/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { projectId, nodeIndex, images, description, actualCost } = event;

    // 验证必填字段
    if (!projectId || nodeIndex === undefined || !images || images.length === 0) {
      return {
        success: false,
        error: '缺少必填字段'
      };
    }

    // 获取项目信息
    const projectResult = await db.collection('construction_projects').doc(projectId).get();
    if (!projectResult.data) {
      return {
        success: false,
        error: '项目不存在'
      };
    }

    const project = projectResult.data;

    // 验证是否是项目的施工方
    if (project.contractorId !== openid) {
      return {
        success: false,
        error: '无权限操作'
      };
    }

    // 更新节点信息
    const stages = project.stages || [];
    if (nodeIndex < 0 || nodeIndex >= stages.length) {
      return {
        success: false,
        error: '节点索引无效'
      };
    }

    stages[nodeIndex] = {
      ...stages[nodeIndex],
      status: 'completed',
      images: images,
      description: description || '',
      actualCost: actualCost || 0,
      completedAt: db.serverDate()
    };

    // 计算总费用
    const totalCost = stages.reduce((sum, stage) => sum + (stage.actualCost || 0), 0);

    // 更新项目状态和当前阶段
    let projectStatus = project.status;
    let currentStage = project.currentStage;
    
    if (nodeIndex === 0) {
      projectStatus = 'constructing';  // 完成准备，进入施工
      currentStage = '施工';
      // 自动开始下一个阶段
      if (stages[1]) {
        stages[1].status = 'in_progress';
        stages[1].startTime = db.serverDate();
      }
    } else if (nodeIndex === 1) {
      projectStatus = 'accepting';  // 完成施工，进入验收
      currentStage = '验收';
      // 自动开始下一个阶段
      if (stages[2]) {
        stages[2].status = 'in_progress';
        stages[2].startTime = db.serverDate();
      }
    } else if (nodeIndex === 2) {
      projectStatus = 'accepting';  // 完成验收，等待确认
      currentStage = '验收完成';
    }

    // 更新数据库
    await db.collection('construction_projects').doc(projectId).update({
      data: {
        stages: stages,
        status: projectStatus,
        currentStage: currentStage,
        actualCost: totalCost,
        updateTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: '节点更新成功'
    };

  } catch (err) {
    console.error('更新节点失败:', err);
    return {
      success: false,
      error: err.message || '更新失败'
    };
  }
};
