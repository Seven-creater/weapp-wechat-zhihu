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
  console.warn('[createDesignSolution] shared validate unavailable');
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
  if (normalized.length === 0) {
    return { ok: false, error: 'missing images' };
  }
  const tooLong = normalized.find((item) => item.length > 1024);
  if (tooLong) {
    return { ok: false, error: 'image url too long' };
  }
  return { ok: true, value: normalized };
}

function normalizeBudget(value) {
  if (value == null || value === '') return { ok: true, value: 0 };
  const num = Number(value);
  if (!Number.isFinite(num)) return { ok: false, error: 'budgetAdjustment must be number' };
  if (num < -10000000 || num > 10000000) {
    return { ok: false, error: 'budgetAdjustment out of range' };
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

  const descriptionCheck = validateString(event.description, {
    name: 'description',
    required: true,
    min: 2,
    max: 2000
  });
  if (!descriptionCheck.ok) return { success: false, error: descriptionCheck.error };

  const imagesCheck = normalizeImages(event.images);
  if (!imagesCheck.ok) return { success: false, error: imagesCheck.error };

  const budgetCheck = normalizeBudget(event.budgetAdjustment);
  if (!budgetCheck.ok) return { success: false, error: budgetCheck.error };

  const quoteCheck = normalizePositiveNumber(event.quoteAmount, 'quoteAmount', 10000000);
  if (!quoteCheck.ok) return { success: false, error: quoteCheck.error };

  const daysCheck = normalizePositiveNumber(event.estimateDays, 'estimateDays', 3650);
  if (!daysCheck.ok) return { success: false, error: daysCheck.error };

  const postId = postIdCheck.value;
  const description = descriptionCheck.value;
  const images = imagesCheck.value;
  const budgetAdjustment = budgetCheck.value;
  const quoteAmount = quoteCheck.value || Math.max(0, budgetAdjustment);
  const estimateDays = Math.round(daysCheck.value || 0);

  try {
    const userResult = await db.collection('users')
      .where({ _openid: OPENID })
      .field({
        _id: true,
        userType: true,
        userInfo: true,
        nickName: true,
        avatarUrl: true
      })
      .limit(1)
      .get();

    const userData = userResult.data && userResult.data[0];
    if (!userData || !['designer', 'contractor'].includes(userData.userType)) {
      return {
        success: false,
        error: 'only designer or contractor can submit proposal'
      };
    }

    const postRes = await db.collection('posts').doc(postId).get();
    const post = postRes.data;
    if (!post) {
      return {
        success: false,
        error: 'post not found'
      };
    }
    if (!['issue', 'demand'].includes(post.type)) {
      return {
        success: false,
        error: 'proposal only supports issue or demand post'
      };
    }
    if (post.type === 'issue' && userData.userType !== 'designer') {
      return {
        success: false,
        error: 'only designer can submit issue proposal'
      };
    }

    const existingSolution = await db.collection('design_proposals').where(_.and([
      _.or([{ issueId: postId }, { postId }]),
      _.or([{ designerId: OPENID }, { _openid: OPENID }])
    ])).limit(1).get();

    if ((existingSolution.data || []).length > 0) {
      return {
        success: false,
        error: 'duplicate proposal'
      };
    }

    const designerName = userData.userInfo?.nickName || userData.nickName || (userData.userType === 'contractor' ? '施工方' : '设计师');
    const designerAvatar = userData.userInfo?.avatarUrl || userData.avatarUrl || '';

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
        userId: userData._id || ''
      },
      description,
      content: description,
      images,
      budgetAdjustment,
      priceAdjustment: budgetAdjustment,
      quoteAmount,
      estimateDays,
      submitterType: userData.userType,
      sourcePostType: post.type,
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('design_proposals').add({
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
      proposalId: result._id,
      message: 'proposal created'
    };
  } catch (err) {
    console.error('[createDesignSolution] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'create design solution failed'
    };
  }
};
