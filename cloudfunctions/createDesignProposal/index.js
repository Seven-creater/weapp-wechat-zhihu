// cloudfunctions/createDesignProposal/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 创建设计方案云函数
 * 设计者为障碍问题帖子添加设计方案
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const {
    postId,
    content,
    images = [],
    priceAdjustment = 0,
    adjustmentReason = ''
  } = event;

  try {
    // 1. 验证参数
    if (!postId) {
      return {
        success: false,
        error: '缺少帖子ID'
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: '设计方案内容不能为空'
      };
    }

    // 2. 验证用户是设计者
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .get();

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
        error: '只有设计者可以添加设计方案'
      };
    }

    // 3. 验证帖子存在且是障碍问题类型
    const postRes = await db.collection('posts')
      .doc(postId)
      .get();

    if (!postRes.data) {
      return {
        success: false,
        error: '帖子不存在'
      };
    }

    if (postRes.data.type !== 'issue') {
      return {
        success: false,
        error: '只能为障碍问题帖子添加设计方案'
      };
    }

    // 4. 创建设计方案数据
    const proposalData = {
      _openid: openid,
      postId: postId,
      issueId: postRes.data.issueId || null,
      
      // 设计者信息
      designerInfo: {
        nickName: user.nickName || '设计者',
        avatarUrl: user.avatarUrl || '',
        userId: user._id
      },
      
      // 方案内容
      content: content.trim(),
      images: images,
      
      // 预算调整
      priceAdjustment: Number(priceAdjustment) || 0,
      adjustmentReason: adjustmentReason.trim(),
      
      // 统计
      likes: 0,
      adopted: false,
      
      // 时间
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    // 5. 插入 design_proposals 集合
    const proposalResult = await db.collection('design_proposals').add({
      data: proposalData
    });

    // 6. 更新帖子的设计方案数量
    await db.collection('posts')
      .doc(postId)
      .update({
        data: {
          designProposalCount: db.command.inc(1),
          updateTime: db.serverDate()
        }
      });

    console.log('设计方案创建成功:', proposalResult._id);

    return {
      success: true,
      proposalId: proposalResult._id,
      message: '设计方案添加成功'
    };

  } catch (error) {
    console.error('创建设计方案失败:', error);
    return {
      success: false,
      error: error.message || '添加失败，请重试'
    };
  }
};



