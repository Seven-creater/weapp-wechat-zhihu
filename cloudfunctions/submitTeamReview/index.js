const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const projectId = toSafeString(event.projectId, 64);
  const teamId = toSafeString(event.teamId, 64);
  if (!projectId || !teamId) return { success: false, error: 'missing params' };

  const comment = toSafeString(event.comment, 500);
  if (!comment) return { success: false, error: 'missing comment' };

  const scores = {
    rating: normalizeScore(event.rating),
    quality: normalizeScore(event.quality),
    timeliness: normalizeScore(event.timeliness),
    communication: normalizeScore(event.communication),
    professionalism: normalizeScore(event.professionalism)
  };
  const photos = Array.isArray(event.photos)
    ? event.photos.map((item) => toSafeString(item, 256)).filter(Boolean).slice(0, 9)
    : [];

  try {
    const projectRes = await db.collection('construction_projects').doc(projectId).get();
    const project = projectRes.data;
    if (!project) return { success: false, error: 'project not found' };
    if (project.reviewed) return { success: false, error: 'already reviewed' };
    if (project.teamId && project.teamId !== teamId) return { success: false, error: 'invalid teamId' };

    const post = project.issueId ? await fetchPost(project.issueId) : null;
    const ownerId = project._openid || (post && post._openid) || '';
    if (ownerId !== OPENID) {
      console.warn('[submitTeamReview] forbidden');
      return { success: false, error: 'forbidden' };
    }

    await db.collection('team_reviews').add({
      data: {
        _openid: OPENID,
        projectId,
        teamId,
        ...scores,
        comment,
        photos,
        createdAt: db.serverDate()
      }
    });

    try {
      const team = await db.collection('construction_teams').doc(teamId).get();
      if (team.data) {
        const currentRating = Number(team.data.rating || 0);
        const reviewCount = Number(team.data.reviewCount || 0);
        const nextRating = ((currentRating * reviewCount) + scores.rating) / (reviewCount + 1);
        await db.collection('construction_teams').doc(teamId).update({
          data: {
            rating: nextRating,
            reviewCount: _.inc(1),
            updatedAt: db.serverDate()
          }
        });
      }
    } catch (_) {}

    await db.collection('construction_projects').doc(projectId).update({
      data: {
        reviewed: true,
        reviewRating: scores.rating,
        updatedAt: db.serverDate()
      }
    });

    return { success: true };
  } catch (err) {
    console.error('[submitTeamReview] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'submit failed' };
  }
};

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

function normalizeScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}
