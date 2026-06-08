const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const projectId = toSafeString(event.projectId || event.id, 64);
  if (!projectId) return { success: false, error: 'missing projectId' };

  try {
    const projectRes = await db.collection('construction_projects').doc(projectId).get();
    const project = projectRes.data;
    if (!project) return { success: false, error: 'project not found' };

    const [user, post] = await Promise.all([
      fetchUser(OPENID),
      project.issueId ? fetchPost(project.issueId) : Promise.resolve(null)
    ]);

    const ownerId = project._openid || (post && post._openid) || '';
    const contractorIds = [
      project.contractorId,
      project.constructorId,
      project.team_openid
    ].filter(Boolean);

    const isOwner = ownerId === OPENID;
    const isContractor = contractorIds.includes(OPENID);
    const isCommunityWorker = user && user.userType === 'communityWorker';

    if (!isOwner && !isContractor && !isCommunityWorker) {
      console.warn('[getConstructionProjectDetail] forbidden');
      return { success: false, error: 'forbidden' };
    }

    const team = project.teamId ? await fetchTeam(project.teamId) : null;
    const canUpdate = isContractor || isCommunityWorker;
    const canReview = isOwner && project.status === 'completed' && !project.reviewed;
    const canConfirm = isOwner || isCommunityWorker;

    return {
      success: true,
      data: {
        project,
        team,
        permissions: {
          canUpdate,
          canReview,
          canConfirm,
          userType: user ? user.userType : 'normal',
          isPoster: isOwner
        }
      }
    };
  } catch (err) {
    console.error('[getConstructionProjectDetail] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

async function fetchUser(openid) {
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ userType: true })
    .limit(1)
    .get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function fetchPost(postId) {
  try {
    const res = await db.collection('posts')
      .where({ _id: postId })
      .field({ _openid: true })
      .limit(1)
      .get();
    return res.data && res.data[0] ? res.data[0] : null;
  } catch (_) {
    return null;
  }
}

async function fetchTeam(teamId) {
  try {
    const teamRes = await db.collection('construction_teams')
      .where({ _id: teamId })
      .field({
        name: true,
        contact: true,
        phone: true,
        address: true,
        specialties: true,
        completedProjects: true,
        rating: true,
        reviewCount: true,
        status: true
      })
      .limit(1)
      .get();
    const team = teamRes.data && teamRes.data[0] ? teamRes.data[0] : null;
    if (!team) return null;

    const reviewRes = await db.collection('team_reviews')
      .where({ teamId })
      .field({
        rating: true,
        quality: true,
        timeliness: true,
        communication: true,
        professionalism: true,
        comment: true,
        photos: true,
        createdAt: true
      })
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    return {
      ...team,
      recentReviews: reviewRes.data || []
    };
  } catch (_) {
    return null;
  }
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
