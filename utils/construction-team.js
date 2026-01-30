/**
 * 施工团队管理模块
 * 用于施工团队的匹配、评价和管理
 */

/**
 * 施工团队数据结构示例
 * {
 *   _id: string,
 *   name: string,              // 团队名称
 *   contact: string,           // 联系人
 *   phone: string,             // 联系电话
 *   address: string,           // 所在地址
 *   location: GeoPoint,        // 地理位置
 *   specialties: array,        // 专长领域
 *   certifications: array,     // 资质证书
 *   experience: number,        // 从业年限
 *   completedProjects: number, // 完成项目数
 *   rating: number,            // 综合评分
 *   reviews: array,            // 评价列表
 *   priceRange: string,        // 价格区间
 *   status: string,            // 状态：active/inactive
 *   createdAt: Date,
 *   updatedAt: Date,
 * }
 */

/**
 * 根据项目需求匹配施工团队
 * @param {object} projectRequirements - 项目需求
 * @returns {Promise<array>} 匹配的施工团队列表
 */
async function matchConstructionTeams(projectRequirements) {
  const {
    category,        // 项目类别
    location,        // 项目位置
    budget,          // 预算范围
    urgency,         // 紧急程度
    area,            // 施工面积
  } = projectRequirements;

  try {
    // 调用云函数进行智能匹配
    const res = await wx.cloud.callFunction({
      name: 'matchConstructionTeams',
      data: {
        category,
        location,
        budget,
        urgency,
        area,
      },
    });

    if (res.result && res.result.success) {
      return res.result.teams || [];
    }

    return [];
  } catch (error) {
    console.error('匹配施工团队失败:', error);
    return [];
  }
}

/**
 * 计算团队匹配度评分
 * @param {object} team - 施工团队信息
 * @param {object} requirements - 项目需求
 * @returns {number} 匹配度评分 (0-100)
 */
function calculateMatchScore(team, requirements) {
  let score = 0;

  // 1. 专业匹配度 (30分)
  if (team.specialties && team.specialties.includes(requirements.category)) {
    score += 30;
  } else if (team.specialties && team.specialties.length > 0) {
    score += 15; // 有相关经验但不完全匹配
  }

  // 2. 距离因素 (20分)
  if (team.location && requirements.location) {
    const distance = calculateDistance(
      team.location.latitude,
      team.location.longitude,
      requirements.location.latitude,
      requirements.location.longitude
    );
    
    if (distance < 5) score += 20;      // 5公里内
    else if (distance < 10) score += 15; // 10公里内
    else if (distance < 20) score += 10; // 20公里内
    else score += 5;                     // 20公里以上
  }

  // 3. 评分因素 (20分)
  if (team.rating) {
    score += (team.rating / 5) * 20;
  }

  // 4. 经验因素 (15分)
  if (team.experience >= 10) score += 15;
  else if (team.experience >= 5) score += 10;
  else if (team.experience >= 3) score += 5;

  // 5. 完成项目数 (15分)
  if (team.completedProjects >= 50) score += 15;
  else if (team.completedProjects >= 20) score += 10;
  else if (team.completedProjects >= 10) score += 5;

  return Math.round(score);
}

/**
 * 计算两点之间的距离（公里）
 * @param {number} lat1 - 纬度1
 * @param {number} lon1 - 经度1
 * @param {number} lat2 - 纬度2
 * @param {number} lon2 - 经度2
 * @returns {number} 距离（公里）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径（公里）
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

/**
 * 创建施工项目
 * @param {object} projectData - 项目数据
 * @returns {Promise<string>} 项目ID
 */
async function createConstructionProject(projectData) {
  const {
    issueId,           // 关联的问题ID
    solutionId,        // 关联的方案ID
    teamId,            // 选定的施工团队ID
    costEstimate,      // 造价估算
    scheduledDate,     // 计划开工日期
    estimatedDuration, // 预计工期
    contactPerson,     // 联系人
    contactPhone,      // 联系电话
    specialRequirements, // 特殊要求
  } = projectData;

  try {
    const db = wx.cloud.database();
    const res = await db.collection('construction_projects').add({
      data: {
        issueId,
        solutionId,
        teamId,
        costEstimate,
        scheduledDate,
        estimatedDuration,
        contactPerson,
        contactPhone,
        specialRequirements,
        status: 'pending',        // pending/confirmed/in_progress/completed/cancelled
        progress: 0,              // 进度百分比
        milestones: [],           // 里程碑记录
        photos: [],               // 施工照片
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });

    return res._id;
  } catch (error) {
    console.error('创建施工项目失败:', error);
    throw error;
  }
}

/**
 * 更新施工进度
 * @param {string} projectId - 项目ID
 * @param {object} progressData - 进度数据
 * @returns {Promise<boolean>} 是否成功
 */
async function updateConstructionProgress(projectId, progressData) {
  const {
    progress,      // 进度百分比
    milestone,     // 里程碑描述
    photos,        // 照片
    notes,         // 备注
  } = progressData;

  try {
    const db = wx.cloud.database();
    const _ = db.command;

    const updateData = {
      progress,
      updatedAt: db.serverDate(),
    };

    // 添加里程碑记录
    if (milestone) {
      updateData.milestones = _.push({
        description: milestone,
        progress,
        photos: photos || [],
        notes: notes || '',
        createdAt: new Date().toISOString(),
      });
    }

    // 添加照片
    if (photos && photos.length > 0) {
      updateData.photos = _.push(photos);
    }

    // 如果进度达到100%，更新状态为已完成
    if (progress >= 100) {
      updateData.status = 'completed';
      updateData.completedAt = db.serverDate();
    }

    await db.collection('construction_projects')
      .doc(projectId)
      .update({ data: updateData });

    return true;
  } catch (error) {
    console.error('更新施工进度失败:', error);
    return false;
  }
}

/**
 * 提交施工评价
 * @param {string} projectId - 项目ID
 * @param {string} teamId - 团队ID
 * @param {object} reviewData - 评价数据
 * @returns {Promise<boolean>} 是否成功
 */
async function submitTeamReview(projectId, teamId, reviewData) {
  const {
    rating,           // 评分 (1-5)
    quality,          // 质量评分
    timeliness,       // 时效评分
    communication,    // 沟通评分
    professionalism,  // 专业度评分
    comment,          // 评价内容
    photos,           // 完工照片
  } = reviewData;

  try {
    const db = wx.cloud.database();
    const _ = db.command;

    // 1. 保存评价记录
    await db.collection('team_reviews').add({
      data: {
        projectId,
        teamId,
        rating,
        quality,
        timeliness,
        communication,
        professionalism,
        comment,
        photos: photos || [],
        createdAt: db.serverDate(),
      },
    });

    // 2. 更新团队评分
    const team = await db.collection('construction_teams').doc(teamId).get();
    if (team.data) {
      const currentRating = team.data.rating || 0;
      const reviewCount = team.data.reviewCount || 0;
      const newRating = ((currentRating * reviewCount) + rating) / (reviewCount + 1);

      await db.collection('construction_teams').doc(teamId).update({
        data: {
          rating: newRating,
          reviewCount: _.inc(1),
          updatedAt: db.serverDate(),
        },
      });
    }

    // 3. 更新项目状态
    await db.collection('construction_projects').doc(projectId).update({
      data: {
        reviewed: true,
        reviewRating: rating,
        updatedAt: db.serverDate(),
      },
    });

    return true;
  } catch (error) {
    console.error('提交评价失败:', error);
    return false;
  }
}

/**
 * 获取施工团队详情
 * @param {string} teamId - 团队ID
 * @returns {Promise<object>} 团队详情
 */
async function getTeamDetails(teamId) {
  try {
    const db = wx.cloud.database();
    const team = await db.collection('construction_teams').doc(teamId).get();
    
    if (team.data) {
      // 获取最近的评价
      const reviews = await db.collection('team_reviews')
        .where({ teamId })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      return {
        ...team.data,
        recentReviews: reviews.data || [],
      };
    }

    return null;
  } catch (error) {
    console.error('获取团队详情失败:', error);
    return null;
  }
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









