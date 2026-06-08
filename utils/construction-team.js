/**
 * 施工项目客户端工具。
 * 所有敏感读写都通过云函数完成，避免客户端直连 construction_* 集合。
 */

async function matchConstructionTeams(projectRequirements) {
  const {
    category,
    location,
    budget,
    urgency,
    area,
  } = projectRequirements || {};

  try {
    const res = await wx.cloud.callFunction({
      name: 'matchConstructionTeams',
      data: { category, location, budget, urgency, area },
    });
    return res.result && res.result.success ? (res.result.teams || []) : [];
  } catch (error) {
    console.error('匹配施工团队失败:', error);
    return [];
  }
}

function calculateMatchScore(team, requirements) {
  let score = 0;
  const req = requirements || {};

  if (team.specialties && team.specialties.includes(req.category)) {
    score += 30;
  } else if (team.specialties && team.specialties.length > 0) {
    score += 15;
  }

  if (team.location && req.location) {
    const distance = calculateDistance(
      team.location.latitude,
      team.location.longitude,
      req.location.latitude,
      req.location.longitude
    );
    if (distance < 5) score += 20;
    else if (distance < 10) score += 15;
    else if (distance < 20) score += 10;
    else score += 5;
  }

  if (team.rating) score += (team.rating / 5) * 20;
  if (team.experience >= 10) score += 15;
  else if (team.experience >= 5) score += 10;
  else if (team.experience >= 3) score += 5;

  if (team.completedProjects >= 50) score += 15;
  else if (team.completedProjects >= 20) score += 10;
  else if (team.completedProjects >= 10) score += 5;

  return Math.round(score);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

async function createConstructionProject(projectData) {
  const res = await wx.cloud.callFunction({
    name: 'createConstructionProject',
    data: projectData || {}
  });
  if (res.result && res.result.success) {
    return res.result.projectId || res.result.id || res.result._id;
  }
  throw new Error((res.result && res.result.error) || 'create project failed');
}

async function updateConstructionProgress(projectId, progressData) {
  const data = {
    projectId,
    ...(progressData || {})
  };
  const res = await wx.cloud.callFunction({
    name: 'updateConstructionProgress',
    data
  });
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || 'update progress failed');
  }
  return true;
}

async function submitTeamReview(projectId, teamId, reviewData) {
  const res = await wx.cloud.callFunction({
    name: 'submitTeamReview',
    data: {
      projectId,
      teamId,
      ...(reviewData || {})
    }
  });
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || 'submit review failed');
  }
  return true;
}

async function getTeamDetails(projectIdOrTeamId) {
  const res = await wx.cloud.callFunction({
    name: 'getConstructionProjectDetail',
    data: {
      projectId: projectIdOrTeamId
    }
  });
  if (res.result && res.result.success && res.result.data) {
    return res.result.data.team || null;
  }
  return null;
}

module.exports = {
  matchConstructionTeams,
  calculateMatchScore,
  calculateDistance,
  createConstructionProject,
  updateConstructionProgress,
  submitTeamReview,
  getTeamDetails,
};
