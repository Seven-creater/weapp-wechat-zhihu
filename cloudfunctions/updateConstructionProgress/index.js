const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const projectId = toSafeString(event.projectId, 64);
  const milestone = toSafeString(event.milestone, 120);
  const notes = toSafeString(event.notes, 500);
  const progress = clamp(Number(event.progress), 0, 100);
  const photos = Array.isArray(event.photos)
    ? event.photos.map((item) => toSafeString(item, 256)).filter(Boolean).slice(0, 9)
    : [];

  if (!projectId) return { success: false, error: 'missing projectId' };
  if (!Number.isFinite(progress) || !milestone) {
    return { success: false, error: 'invalid progress payload' };
  }

  try {
    const projectRes = await db.collection('construction_projects').doc(projectId).get();
    const project = projectRes.data;
    if (!project) return { success: false, error: 'project not found' };

    const userRes = await db.collection('users')
      .where({ _openid: OPENID })
      .field({ userType: true, userInfo: true })
      .limit(1)
      .get();
    const user = userRes.data && userRes.data[0];
    const contractorIds = [project.constructorId, project.contractorId, project.team_openid].filter(Boolean);
    const canUpdate =
      (user && user.userType === 'contractor' && contractorIds.includes(OPENID)) ||
      (user && user.userType === 'communityWorker');

    if (!canUpdate) {
      console.warn('[updateConstructionProgress] forbidden');
      return { success: false, error: 'forbidden' };
    }

    const milestoneData = {
      stage: milestone,
      completedAt: new Date().toISOString(),
      photos,
      notes,
      updatedBy: OPENID,
      updatedByName: (user.userInfo && user.userInfo.nickName) || '施工方'
    };

    const updateData = {
      progress,
      milestones: _.push(milestoneData),
      updateTime: db.serverDate()
    };

    if (progress >= 100) {
      updateData.status = 'completed';
      updateData['plan.actualEndDate'] = new Date().toISOString();
    } else if (progress > 0 && project.status === 'pending') {
      updateData.status = 'in_progress';
      if (!project.plan || !project.plan.startDate) {
        updateData['plan.startDate'] = new Date().toISOString();
      }
    }

    await db.collection('construction_projects').doc(projectId).update({ data: updateData });

    const postRes = await db.collection('posts')
      .where({ 'constructionProject.projectId': projectId })
      .field({ _id: true })
      .limit(1)
      .get();

    if (postRes.data && postRes.data[0]) {
      await db.collection('posts').doc(postRes.data[0]._id).update({
        data: {
          'constructionProject.progress': progress,
          'constructionProject.milestones': _.push(milestoneData),
          'constructionProject.status': updateData.status || project.status,
          updateTime: db.serverDate()
        }
      });
    }

    return {
      success: true,
      message: 'construction progress updated',
      progress,
      milestone: milestoneData
    };
  } catch (err) {
    console.error('[updateConstructionProgress] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'update failed' };
  }
};

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return NaN;
  return Math.min(max, Math.max(min, Math.round(value)));
}
