// 云函数：createConstructionProject
// 施工方创建施工项目（接单）
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
    const { postId } = event;

    // 验证参数
    if (!postId) {
      return {
        success: false,
        error: '参数错误：缺少帖子ID'
      };
    }

    // 1. 验证用户是施工方
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      };
    }

    const user = userRes.data[0];
    if (user.userType !== 'contractor') {
      return {
        success: false,
        error: '仅施工方可以创建施工项目'
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

    // 3. 检查帖子状态
    if (post.status !== 'pending') {
      return {
        success: false,
        error: '该帖子已有施工方接单'
      };
    }

    // 4. 检查是否已有施工项目
    if (post.constructionProject && post.constructionProject.projectId) {
      return {
        success: false,
        error: '该帖子已有施工项目'
      };
    }

    // 5. 创建施工项目记录
    const projectData = {
      postId: postId,
      issueId: post.issueId || '',
      
      // 项目基本信息
      projectName: post.content ? post.content.substring(0, 30) : '无障碍改造项目',
      category: post.category || '',  // 分类ID
      categoryName: post.categoryName || '',  // 分类名称
      
      // 业主信息
      ownerId: post._openid,
      ownerName: post.userInfo?.nickName || '业主',
      ownerPhone: post.userInfo?.phone || '',
      
      // 施工方信息
      contractorId: openid,
      contractorName: user.userInfo?.nickName || '施工方',
      contractorAvatar: user.userInfo?.avatarUrl || '',
      contractorPhone: user.profile?.contactPhone || '',
      contractorCompany: user.profile?.companyName || '',
      
      // 项目状态
      status: 'pending',  // pending | in_progress | completed | cancelled
      
      // 施工计划
      plan: {
        startDate: null,
        endDate: null,
        estimatedDuration: 0,
        budget: post.initialSolution?.estimatedCost || 0
      },
      
      // 施工进度
      progress: 0,
      milestones: [],
      
      // 监督记录
      supervisions: [],
      
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const projectRes = await db.collection('construction_projects').add({
      data: projectData
    });

    const projectId = projectRes._id;

    // 6. 更新帖子状态为"处理中"
    await db.collection('posts').doc(postId).update({
      data: {
        status: 'in_progress',
        constructionProject: {
          projectId: projectId,
          constructorId: openid,
          constructorName: user.userInfo?.nickName || '施工方',
          constructorCompany: user.profile?.companyName || '',
          status: 'pending',
          startDate: null,
          progress: 0,
          milestones: []
        },
        updateTime: db.serverDate()
      }
    });

    console.log('✅ 施工项目已创建:', projectId, '施工方:', openid);

    return {
      success: true,
      message: '施工项目已创建',
      projectId: projectId
    };

  } catch (err) {
    console.error('创建施工项目失败:', err);
    return {
      success: false,
      error: err.message || '创建失败，请稍后重试'
    };
  }
};



