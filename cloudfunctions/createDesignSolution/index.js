// cloudfunctions/createDesignSolution/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { postId, description, images, budgetAdjustment } = event;

    // 验证必填字段
    if (!postId || !description || !images || images.length === 0) {
      return {
        success: false,
        error: '缺少必填字段'
      };
    }

    // 获取设计师信息
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get();

    const userData = userResult.data[0] || {};
    
    // 从 userInfo 对象或直接字段中获取头像和昵称
    const designerName = userData.userInfo?.nickName || userData.nickName || '设计师';
    const designerAvatar = userData.userInfo?.avatarUrl || userData.avatarUrl || '';

    // 验证用户是设计师
    if (userData.userType !== 'designer') {
      return {
        success: false,
        error: '仅设计师可以提交设计方案'
      };
    }

    // 检查是否已经提交过方案
    const existingSolution = await db.collection('design_proposals').where({
      issueId: postId,
      designerId: openid
    }).get();

    if (existingSolution.data.length > 0) {
      return {
        success: false,
        error: '您已经为该问题提交过设计方案'
      };
    }

    // 创建设计方案记录
    const proposalData = {
      issueId: postId,
      designerId: openid,
      designerName: designerName,
      designerAvatar: designerAvatar,
      description: description.trim(),
      images: images,
      budgetAdjustment: budgetAdjustment || 0,
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('design_proposals').add({
      data: proposalData
    });

    // 注意：设计师提交方案不改变帖子状态
    // 只有施工方创建项目后，帖子状态才变为 'processing'

    return {
      success: true,
      proposalId: result._id,
      message: '设计方案提交成功'
    };

  } catch (err) {
    console.error('创建设计方案失败:', err);
    return {
      success: false,
      error: err.message || '提交失败'
    };
  }
};


