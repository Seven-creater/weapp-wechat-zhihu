const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[createDesignProposal] shared validate unavailable');
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  const { name = 'value', required = false, min = 0, max = 2000 } = options;
  if (value == null || value === '') {
    if (required) return { ok: false, error: `missing ${name}` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, error: `${name} must be string` };
  const text = value.trim();
  if (required && !text) return { ok: false, error: `missing ${name}` };
  if (text.length < min) return { ok: false, error: `${name} too short` };
  if (text.length > max) return { ok: false, error: `${name} too long` };
  return { ok: true, value: text };
}

function normalizeImages(images) {
  if (!Array.isArray(images)) {
    return { ok: false, error: 'images must be array' };
  }
  const normalized = images
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 9);
  const tooLong = normalized.find((item) => item.length > 1024);
  if (tooLong) {
    return { ok: false, error: 'image url too long' };
  }
  return { ok: true, value: normalized };
}

function normalizeBudget(value) {
  if (value == null || value === '') return { ok: true, value: 0 };
  const num = Number(value);
  if (!Number.isFinite(num)) return { ok: false, error: 'priceAdjustment must be number' };
  if (num < -10000000 || num > 10000000) {
    return { ok: false, error: 'priceAdjustment out of range' };
  }
  return { ok: true, value: num };
}

function normalizePositiveNumber(value, fieldName, maxValue) {
  if (value == null || value === '') return { ok: true, value: 0 };
  const num = Number(value);
  if (!Number.isFinite(num)) return { ok: false, error: `${fieldName} must be number` };
  if (num < 0 || num > maxValue) {
    return { ok: false, error: `${fieldName} out of range` };
  }
  return { ok: true, value: num };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, error: 'unauthorized' };
  }

  const postIdCheck = validateString(event.postId, {
    name: 'postId',
    required: true,
    min: 8,
    max: 64
  });
  if (!postIdCheck.ok) return { success: false, error: postIdCheck.error };

  const contentCheck = validateString(event.content, {
    name: 'content',
    required: true,
    min: 2,
    max: 2000
  });
  if (!contentCheck.ok) return { success: false, error: contentCheck.error };

  const imagesCheck = normalizeImages(event.images || []);
  if (!imagesCheck.ok) return { success: false, error: imagesCheck.error };

  const budgetCheck = normalizeBudget(event.priceAdjustment);
  if (!budgetCheck.ok) return { success: false, error: budgetCheck.error };

  const quoteCheck = normalizePositiveNumber(event.quoteAmount, 'quoteAmount', 10000000);
  if (!quoteCheck.ok) return { success: false, error: quoteCheck.error };

  const daysCheck = normalizePositiveNumber(event.estimateDays, 'estimateDays', 3650);
  if (!daysCheck.ok) return { success: false, error: daysCheck.error };

  const reasonCheck = validateString(event.adjustmentReason, {
    name: 'adjustmentReason',
    required: false,
    max: 500
  });
  if (!reasonCheck.ok) return { success: false, error: reasonCheck.error };

  const postId = postIdCheck.value;
  const description = contentCheck.value;
  const images = imagesCheck.value;
  const budgetAdjustment = budgetCheck.value;
  const quoteAmount = quoteCheck.value || Math.max(0, budgetAdjustment);
  const estimateDays = Math.round(daysCheck.value || 0);
  const adjustmentReason = reasonCheck.value;

  try {
    const userRes = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        _openid: true,
        userType: true,
        userInfo: true,
        nickName: true,
        avatarUrl: true
      })
      .limit(1)
      .get();

    const user = userRes.data && userRes.data[0];
    if (!user) {
      return {
        success: false,
        error: 'user not found'
      };
    }

    if (!['designer', 'contractor'].includes(user.userType)) {
      return {
        success: false,
        error: 'only designer or contractor can create proposal'
      };
    }

    const postRes = await db.collection('posts')
      .doc(postId)
      .get();

    if (!postRes.data) {
      return {
        success: false,
        error: 'post not found'
      };
    }

    const post = postRes.data;
    if (!['issue', 'demand'].includes(post.type)) {
      return {
        success: false,
        error: 'proposal only supports issue or demand post'
      };
    }

    if (post.type === 'issue' && user.userType !== 'designer') {
      return {
        success: false,
        error: 'only designer can create issue proposal'
      };
    }

    const duplicateRes = await db.collection('design_proposals').where(_.and([
      _.or([{ issueId: postId }, { postId }]),
      _.or([{ designerId: OPENID }, { _openid: OPENID }])
    ])).limit(1).get();

    if ((duplicateRes.data || []).length > 0) {
      return {
        success: false,
        error: 'duplicate proposal'
      };
    }

    const designerName = user.userInfo?.nickName || user.nickName || (user.userType === 'contractor' ? '施工方' : '设计师');
    const designerAvatar = user.userInfo?.avatarUrl || user.avatarUrl || '';

    const proposalData = {
      _openid: OPENID,
      postId,
      issueId: postId,
      designerId: OPENID,
      designerName,
      designerAvatar,
      designerInfo: {
        nickName: designerName,
        avatarUrl: designerAvatar,
        userId: user._id || ''
      },
      description,
      content: description,
      images,
      budgetAdjustment,
      priceAdjustment: budgetAdjustment,
      quoteAmount,
      estimateDays,
      adjustmentReason,
      submitterType: user.userType,
      sourcePostType: post.type,
      likes: 0,
      adopted: false,
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const proposalResult = await db.collection('design_proposals').add({
      data: proposalData
    });

    const postUpdateData = {
      designProposalCount: db.command.inc(1),
      updateTime: db.serverDate()
    };
    if (post.type === 'demand' && post.status === 'pending') {
      postUpdateData.status = 'accepted';
    }

    await db.collection('posts').doc(postId).update({ data: postUpdateData });

    return {
      success: true,
      proposalId: proposalResult._id,
      message: 'proposal created'
    };
  } catch (error) {
    console.error('[createDesignProposal] failed:', error);
    return {
      success: false,
      error: error && error.message ? error.message : 'create failed'
    };
  }
};
