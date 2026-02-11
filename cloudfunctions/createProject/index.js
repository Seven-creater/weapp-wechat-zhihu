// cloudfunctions/createProject/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { postId, title, contactPhone } = event;

    // 验证必填字段
    if (!postId || !title || !contactPhone) {
      return {
        success: false,
        error: '缺少必填字段'
      };
    }

    // 获取施工方信息
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get();

    const userData = userResult.data[0] || {};
    
    // 从 userInfo 对象或直接字段中获取头像和昵称
    const contractorName = userData.userInfo?.nickName || userData.nickName || '施工方';
    const contractorAvatar = userData.userInfo?.avatarUrl || userData.avatarUrl || '';

    // 验证用户是施工方
    if (userData.userType !== 'contractor') {
      return {
        success: false,
        error: '仅施工方可以创建项目'
      };
    }

    // 获取帖子信息
    const postResult = await db.collection('posts').doc(postId).get();
    if (!postResult.data) {
      return {
        success: false,
        error: '帖子不存在'
      };
    }

    const post = postResult.data;

    // 检查是否已经有项目
    const existingProject = await db.collection('construction_projects').where({
      issueId: postId
    }).get();

    if (existingProject.data.length > 0) {
      return {
        success: false,
        error: '该问题已经有施工项目'
      };
    }

    // 创建项目记录
    const projectData = {
      issueId: postId,
      title: title,
      category: post.category || '',
      engineeringType: post.engineeringType || post.category || '',
      contractorId: openid,
      contractorName: contractorName,
      contractorAvatar: contractorAvatar,
      contactPhone: contactPhone,
      status: 'preparing',  // 准备阶段
      currentStage: '准备',
      location: post.location || null,
      address: post.address || '',
      formattedAddress: post.formattedAddress || '',
      detailAddress: post.detailAddress || '',
      budget: post.aiSolution?.budget || 0,
      actualCost: 0,
      // 三个固定节点
      stages: [
        {
          name: '准备',
          status: 'in_progress',
          images: [],
          description: '',
          actualCost: 0,
          startTime: db.serverDate(),
          completedAt: null
        },
        {
          name: '施工',
          status: 'pending',
          images: [],
          description: '',
          actualCost: 0,
          startTime: null,
          completedAt: null
        },
        {
          name: '验收',
          status: 'pending',
          images: [],
          description: '',
          actualCost: 0,
          startTime: null,
          completedAt: null
        }
      ],
      confirmedBy: {
        owner: false,
        communityWorker: false
      },
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      completedTime: null
    };

    const result = await db.collection('construction_projects').add({
      data: projectData
    });

    // 更新帖子状态为processing
    await db.collection('posts').doc(postId).update({
      data: {
        status: 'processing',
        updateTime: db.serverDate()
      }
    });

    return {
      success: true,
      projectId: result._id,
      message: '项目创建成功'
    };

  } catch (err) {
    console.error('创建项目失败:', err);
    return {
      success: false,
      error: err.message || '创建失败'
    };
  }
};
