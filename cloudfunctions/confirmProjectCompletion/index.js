// cloudfunctions/confirmProjectCompletion/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { projectId, postId, confirmedBy } = event;

    // 验证必填字段
    if (!projectId || !confirmedBy) {
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

    // 检查所有节点是否完成
    const allNodesCompleted = project.stages.every(stage => stage.status === 'completed');
    if (!allNodesCompleted) {
      return {
        success: false,
        error: '请先完成所有施工节点'
      };
    }

    // 获取帖子信息验证权限
    const postResult = await db.collection('posts').doc(project.issueId).get();
    if (!postResult.data) {
      return {
        success: false,
        error: '关联帖子不存在'
      };
    }

    const post = postResult.data;

    // 验证权限
    const userResult = await db.collection('users').where({ _openid: openid }).get();
    const userType = userResult.data[0]?.userType;

    const isOwner = post._openid === openid;
    const isCommunityWorker = userType === 'communityWorker';

    if (!isOwner && !isCommunityWorker) {
      return {
        success: false,
        error: '无权限确认'
      };
    }

    // 更新确认状态
    const confirmedByData = project.confirmedBy || {};
    if (confirmedBy === 'owner') {
      confirmedByData.owner = true;
    } else if (confirmedBy === 'communityWorker') {
      confirmedByData.communityWorker = true;
    }

    // 检查是否双方都确认（任一确认即可）
    const isConfirmed = confirmedByData.owner || confirmedByData.communityWorker;

    if (isConfirmed) {
      // 更新项目状态为已完成
      await db.collection('construction_projects').doc(projectId).update({
        data: {
          status: 'completed',
          confirmedBy: confirmedByData,
          completedTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      // 更新帖子状态为已完成
      await db.collection('posts').doc(project.issueId).update({
        data: {
          status: 'completed',
          updateTime: db.serverDate()
        }
      });

      // 创建案例记录
      await createCase(project, post);

      return {
        success: true,
        message: '项目已确认完成，已移至案例板块'
      };
    } else {
      // 只更新确认状态，等待另一方确认
      await db.collection('construction_projects').doc(projectId).update({
        data: {
          confirmedBy: confirmedByData,
          updateTime: db.serverDate()
        }
      });

      return {
        success: true,
        message: '确认成功，等待另一方确认'
      };
    }

  } catch (err) {
    console.error('确认完成失败:', err);
    return {
      success: false,
      error: err.message || '确认失败'
    };
  }
};

// 创建案例记录
async function createCase(project, post) {
  try {
    // 计算工期
    const startTime = new Date(project.createTime);
    const endTime = new Date(project.completedTime);
    const duration = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));

    // 获取封面图（第一个节点的第一张图片）
    let coverImage = '';
    for (const stage of project.stages) {
      if (stage.images && stage.images.length > 0) {
        coverImage = stage.images[0];
        break;
      }
    }

    const caseData = {
      postId: project.issueId,
      projectId: project._id,
      category: project.category || post.category,  // 分类ID
      categoryName: project.categoryName || post.categoryName,  // 分类名称
      title: project.title,
      coverImage: coverImage,
      budget: project.budget || 0,
      actualCost: project.actualCost || 0,
      duration: duration,
      contractorId: project.contractorId,
      contractorName: project.contractorName,
      contractorAvatar: project.contractorAvatar,
      stages: project.stages,
      location: project.location,
      address: project.address,
      formattedAddress: project.formattedAddress,
      completedAt: db.serverDate(),
      createTime: db.serverDate()
    };

    await db.collection('cases').add({
      data: caseData
    });

    console.log('案例创建成功');
  } catch (err) {
    console.error('创建案例失败:', err);
    // 不抛出错误，避免影响主流程
  }
}
