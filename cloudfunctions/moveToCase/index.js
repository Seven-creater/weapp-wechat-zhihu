// cloudfunctions/moveToCase/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 移入案例板块云函数
 * 将完成的项目移入案例板块，供其他用户学习参考
 */
exports.main = async (event, context) => {
  const { projectId } = event;

  try {
    // 1. 验证参数
    if (!projectId) {
      return {
        success: false,
        error: '缺少项目ID'
      };
    }

    // 2. 获取项目信息
    const projectRes = await db.collection('projects')
      .doc(projectId)
      .get();

    if (!projectRes.data) {
      return {
        success: false,
        error: '项目不存在'
      };
    }

    const project = projectRes.data;

    // 3. 检查是否已移入案例
    if (project.completion.movedToCase) {
      return {
        success: false,
        error: '该项目已在案例板块中'
      };
    }

    // 4. 获取帖子信息
    const postRes = await db.collection('posts')
      .doc(project.postId)
      .get();

    if (!postRes.data) {
      return {
        success: false,
        error: '关联帖子不存在'
      };
    }

    const post = postRes.data;

    // 5. 获取设计方案（如果有）
    const proposalsRes = await db.collection('design_proposals')
      .where({
        postId: project.postId
      })
      .orderBy('likes', 'desc')
      .limit(1)
      .get();

    const designProposal = proposalsRes.data && proposalsRes.data.length > 0 
      ? proposalsRes.data[0] 
      : null;

    // 6. 创建案例数据
    const caseData = {
      originalPostId: project.postId,
      originalProjectId: projectId,
      
      title: project.title,
      category: project.category,
      
      // 问题描述
      problem: {
        description: post.content || '',
        images: post.images || [],
        location: post.location || null,
        address: post.formattedAddress || post.address || '',
        reportedBy: {
          nickName: post.userInfo?.nickName || '用户',
          avatarUrl: post.userInfo?.avatarUrl || ''
        },
        reportTime: post.createTime
      },
      
      // 设计方案（如果有）
      designProposal: designProposal ? {
        designer: {
          nickName: designProposal.designerInfo?.nickName || '设计者',
          avatarUrl: designProposal.designerInfo?.avatarUrl || ''
        },
        content: designProposal.content || '',
        images: designProposal.images || [],
        priceAdjustment: designProposal.priceAdjustment || 0
      } : null,
      
      // 施工过程
      construction: {
        contractor: {
          nickName: project.contractorInfo?.nickName || '施工方',
          avatarUrl: project.contractorInfo?.avatarUrl || ''
        },
        nodes: project.nodes.map(node => ({
          name: node.name,
          images: node.images || [],
          description: node.description || '',
          completedTime: node.completedTime
        })),
        startTime: project.createTime,
        completedTime: project.completion.confirmedTime
      },
      
      // 预算信息
      budget: {
        estimated: post.priceEstimate || 0,
        adjusted: designProposal ? (post.priceEstimate || 0) + (designProposal.priceAdjustment || 0) : (post.priceEstimate || 0),
        final: project.actualCost || 0
      },
      
      // 统计
      views: 0,
      likes: 0,
      collections: 0,
      
      // 时间
      createTime: db.serverDate(),
      featured: false  // 默认不精选，由算法计算
    };

    // 7. 插入 cases 集合
    const caseResult = await db.collection('cases').add({
      data: caseData
    });

    const caseId = caseResult._id;

    // 8. 更新项目状态
    await db.collection('projects')
      .doc(projectId)
      .update({
        data: {
          'completion.movedToCase': true,
          caseId: caseId,
          updateTime: db.serverDate()
        }
      });

    // 9. 更新帖子状态为"已处理"
    await db.collection('posts')
      .doc(project.postId)
      .update({
        data: {
          status: 'completed',
          caseId: caseId,
          updateTime: db.serverDate()
        }
      });

    // 10. 计算是否精选（自动算法）
    const shouldBeFeatured = await calculateFeaturedScore(caseData);
    if (shouldBeFeatured) {
      await db.collection('cases')
        .doc(caseId)
        .update({
          data: {
            featured: true
          }
        });
    }

    console.log('案例创建成功:', caseId, '精选:', shouldBeFeatured);

    return {
      success: true,
      caseId: caseId,
      featured: shouldBeFeatured,
      message: '已移入案例板块'
    };

  } catch (error) {
    console.error('移入案例板块失败:', error);
    return {
      success: false,
      error: error.message || '移入失败，请重试'
    };
  }
};

/**
 * 计算案例精选评分算法
 * 根据多个维度评分，决定是否精选
 */
async function calculateFeaturedScore(caseData) {
  let score = 0;

  // 1. 有设计方案 +20分
  if (caseData.designProposal) {
    score += 20;
  }

  // 2. 有完整的施工照片 +30分
  const totalImages = caseData.construction.nodes.reduce((sum, node) => {
    return sum + (node.images?.length || 0);
  }, 0);
  if (totalImages >= 6) {
    score += 30;
  } else if (totalImages >= 3) {
    score += 15;
  }

  // 3. 问题描述详细 +10分
  if (caseData.problem.description && caseData.problem.description.length > 50) {
    score += 10;
  }

  // 4. 有问题照片 +10分
  if (caseData.problem.images && caseData.problem.images.length > 0) {
    score += 10;
  }

  // 5. 预算信息完整 +15分
  if (caseData.budget.final > 0) {
    score += 15;
  }

  // 6. 施工周期合理 +15分
  if (caseData.construction.startTime && caseData.construction.completedTime) {
    const duration = new Date(caseData.construction.completedTime) - new Date(caseData.construction.startTime);
    const days = duration / (1000 * 60 * 60 * 24);
    if (days >= 3 && days <= 30) {  // 3-30天
      score += 15;
    }
  }

  // 总分>=70分，设为精选
  return score >= 70;
}



