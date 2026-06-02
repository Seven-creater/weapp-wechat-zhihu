const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

let sharedAuth = null;
try {
  sharedAuth = require('../_shared/auth');
} catch (err) {
  console.warn('[moveToCase] shared auth unavailable');
}

let sharedValidate = null;
try {
  sharedValidate = require('../_shared/validate');
} catch (err) {
  console.warn('[moveToCase] shared validate unavailable');
}

const SUPER_ADMIN_OPENIDS = (process.env.SUPER_ADMIN_OPENIDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const projectCheck = validateString(event.projectId, {
    name: 'projectId',
    required: true,
    min: 8,
    max: 64
  });

  if (!OPENID) {
    return { success: false, error: 'unauthorized' };
  }
  if (!projectCheck.ok) {
    return { success: false, error: projectCheck.error };
  }

  const projectId = projectCheck.value;

  try {
    const projectRes = await db.collection('projects')
      .doc(projectId)
      .get();
    const project = projectRes.data;
    if (!project) {
      return { success: false, error: 'project not found' };
    }

    const completion = project.completion || {};
    if (completion.movedToCase) {
      return { success: false, error: 'already moved' };
    }

    const postId = toSafeString(project.postId, 64);
    if (!postId) {
      return { success: false, error: 'invalid postId' };
    }

    const postRes = await db.collection('posts')
      .doc(postId)
      .get();
    const post = postRes.data;
    if (!post) {
      return { success: false, error: 'post not found' };
    }

    const callerIsAdmin = await isAdmin(OPENID);
    if (!callerIsAdmin && !canManageProject(OPENID, project, post)) {
      return { success: false, error: 'permission denied' };
    }

    const proposalsRes = await db.collection('design_proposals')
      .where({ postId })
      .orderBy('likes', 'desc')
      .limit(1)
      .get();
    const designProposal = (proposalsRes.data && proposalsRes.data[0]) || null;

    const nodes = Array.isArray(project.nodes) ? project.nodes : [];
    const caseData = {
      originalPostId: postId,
      originalProjectId: projectId,
      title: project.title || '',
      category: project.category || '',
      problem: {
        description: post.content || '',
        images: Array.isArray(post.images) ? post.images : [],
        location: post.location || null,
        address: post.formattedAddress || post.address || '',
        reportedBy: {
          nickName: (post.userInfo && post.userInfo.nickName) || '用户',
          avatarUrl: (post.userInfo && post.userInfo.avatarUrl) || ''
        },
        reportTime: post.createTime || null
      },
      designProposal: designProposal ? {
        designer: {
          nickName: (designProposal.designerInfo && designProposal.designerInfo.nickName) || '设计者',
          avatarUrl: (designProposal.designerInfo && designProposal.designerInfo.avatarUrl) || ''
        },
        content: designProposal.content || '',
        images: Array.isArray(designProposal.images) ? designProposal.images : [],
        priceAdjustment: Number(designProposal.priceAdjustment) || 0
      } : null,
      construction: {
        contractor: {
          nickName: (project.contractorInfo && project.contractorInfo.nickName) || '施工方',
          avatarUrl: (project.contractorInfo && project.contractorInfo.avatarUrl) || ''
        },
        nodes: nodes.map((node) => ({
          name: node && node.name ? node.name : '',
          images: Array.isArray(node && node.images) ? node.images : [],
          description: node && node.description ? node.description : '',
          completedTime: node && node.completedTime ? node.completedTime : null
        })),
        startTime: project.createTime || null,
        completedTime: completion.confirmedTime || null
      },
      budget: {
        estimated: Number(post.priceEstimate) || 0,
        adjusted: designProposal
          ? (Number(post.priceEstimate) || 0) + (Number(designProposal.priceAdjustment) || 0)
          : (Number(post.priceEstimate) || 0),
        final: Number(project.actualCost) || 0
      },
      views: 0,
      likes: 0,
      collections: 0,
      createTime: db.serverDate(),
      featured: false
    };

    const caseResult = await db.collection('cases').add({ data: caseData });
    const caseId = caseResult._id;

    await db.collection('projects')
      .doc(projectId)
      .update({
        data: {
          'completion.movedToCase': true,
          caseId,
          updateTime: db.serverDate()
        }
      });

    await db.collection('posts')
      .doc(postId)
      .update({
        data: {
          status: 'completed',
          caseId,
          updateTime: db.serverDate()
        }
      });

    const shouldBeFeatured = await calculateFeaturedScore(caseData);
    if (shouldBeFeatured) {
      await db.collection('cases')
        .doc(caseId)
        .update({
          data: { featured: true }
        });
    }

    return {
      success: true,
      caseId,
      featured: shouldBeFeatured
    };
  } catch (error) {
    console.error('[moveToCase] failed:', error && error.message ? error.message : error);
    return {
      success: false,
      error: error && error.message ? error.message : 'move failed'
    };
  }
};

async function isAdmin(openid) {
  if (!openid) return false;
  if (sharedAuth && typeof sharedAuth.isAdmin === 'function') {
    return sharedAuth.isAdmin({ db, openid });
  }
  if (SUPER_ADMIN_OPENIDS.includes(openid)) {
    return true;
  }

  const userQuery = await db.collection('users')
    .where({ _openid: openid })
    .field({ isAdmin: true, permissions: true })
    .limit(1)
    .get();
  const user = userQuery.data && userQuery.data[0];
  return !!(user && (user.isAdmin === true || (user.permissions && user.permissions.canManageUsers === true)));
}

function validateString(value, options = {}) {
  if (sharedValidate && typeof sharedValidate.validateString === 'function') {
    return sharedValidate.validateString(value, options);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `missing ${options.name || 'value'}` };
  }
  return { ok: true, value: value.trim() };
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function canManageProject(openid, project, post) {
  const candidates = [
    project && project._openid,
    project && project.creatorId,
    project && project.contractorId,
    project && project.contractorOpenid,
    post && post._openid
  ].map((value) => toSafeString(value, 64)).filter(Boolean);

  return candidates.includes(openid);
}

async function calculateFeaturedScore(caseData) {
  let score = 0;

  if (caseData.designProposal) {
    score += 20;
  }

  const totalImages = (caseData.construction.nodes || []).reduce((sum, node) => {
    return sum + ((node.images && node.images.length) || 0);
  }, 0);
  if (totalImages >= 6) {
    score += 30;
  } else if (totalImages >= 3) {
    score += 15;
  }

  if (caseData.problem.description && caseData.problem.description.length > 50) {
    score += 10;
  }

  if (caseData.problem.images && caseData.problem.images.length > 0) {
    score += 10;
  }

  if (caseData.budget.final > 0) {
    score += 15;
  }

  if (caseData.construction.startTime && caseData.construction.completedTime) {
    const duration = new Date(caseData.construction.completedTime) - new Date(caseData.construction.startTime);
    const days = duration / (1000 * 60 * 60 * 24);
    if (days >= 3 && days <= 30) {
      score += 15;
    }
  }

  return score >= 70;
}
