const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[createProject] shared validate unavailable');
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

function isValidPhone(value) {
  if (!value) return false;
  return /^[0-9+\-\s()]{6,32}$/.test(value);
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
  if (!postIdCheck.ok) {
    return { success: false, error: postIdCheck.error };
  }

  const titleCheck = validateString(event.title, {
    name: 'title',
    required: true,
    min: 2,
    max: 80
  });
  if (!titleCheck.ok) {
    return { success: false, error: titleCheck.error };
  }

  const contactPhoneCheck = validateString(event.contactPhone, {
    name: 'contactPhone',
    required: true,
    min: 6,
    max: 32
  });
  if (!contactPhoneCheck.ok) {
    return { success: false, error: contactPhoneCheck.error };
  }
  if (!isValidPhone(contactPhoneCheck.value)) {
    return { success: false, error: 'invalid contactPhone' };
  }

  const postId = postIdCheck.value;
  const title = titleCheck.value;
  const contactPhone = contactPhoneCheck.value;

  try {
    const userResult = await db.collection('users').where({
      _openid: OPENID
    }).field({
      userType: true,
      userInfo: true,
      nickName: true,
      avatarUrl: true
    }).limit(1).get();

    const userData = userResult.data && userResult.data[0];
    if (!userData || userData.userType !== 'contractor') {
      return {
        success: false,
        error: '仅施工方可以创建项目'
      };
    }

    const contractorName = userData.userInfo?.nickName || userData.nickName || '施工方';
    const contractorAvatar = userData.userInfo?.avatarUrl || userData.avatarUrl || '';

    const postResult = await db.collection('posts').doc(postId).get();
    if (!postResult.data) {
      return {
        success: false,
        error: '帖子不存在'
      };
    }
    const post = postResult.data;
    if (!['issue', 'demand'].includes(post.type)) {
      return {
        success: false,
        error: 'project only supports issue or demand post'
      };
    }

    const existingProject = await db.collection('construction_projects').where({
      issueId: postId
    }).limit(1).get();
    if ((existingProject.data || []).length > 0) {
      return {
        success: false,
        error: '该问题已经有关联项目'
      };
    }

    const projectData = {
      issueId: postId,
      title,
      category: post.categoryName || post.category || '',
      engineeringType: post.engineeringType || post.categoryName || post.category || '',
      contractorId: OPENID,
      contractorName,
      contractorAvatar,
      contactPhone,
      status: 'preparing',
      currentStage: '准备',
      location: post.location || null,
      address: post.address || '',
      formattedAddress: post.formattedAddress || '',
      detailAddress: post.detailAddress || '',
      budget: Number(post.aiSolution?.budget) || 0,
      actualCost: 0,
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

    await db.collection('posts').doc(postId).update({
      data: {
        status: post.type === 'demand' ? 'constructing' : 'processing',
        updateTime: db.serverDate()
      }
    });

    return {
      success: true,
      projectId: result._id,
      message: '项目创建成功'
    };
  } catch (err) {
    console.error('[createProject] failed:', err);
    return {
      success: false,
      error: err && err.message ? err.message : 'create project failed'
    };
  }
};
