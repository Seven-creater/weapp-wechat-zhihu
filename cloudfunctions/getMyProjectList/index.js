const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ACTIVE_STATUSES = ['preparing', 'constructing', 'accepting', 'pending', 'in_progress'];

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };

  const tab = event.tab === 'completed' ? 'completed' : 'active';
  const statusCondition = tab === 'completed' ? ['completed'] : ACTIVE_STATUSES;

  try {
    const [projectRows, legacyRows] = await Promise.all([
      queryConstructionProjects(OPENID, statusCondition),
      queryLegacyIssues(OPENID, statusCondition)
    ]);

    const byId = new Map();
    projectRows.concat(legacyRows).forEach((item) => {
      if (item && item._id && !byId.has(item._id)) {
        byId.set(item._id, item);
      }
    });

    return {
      success: true,
      data: Array.from(byId.values()).sort((a, b) => toTime(b.createTime) - toTime(a.createTime))
    };
  } catch (err) {
    console.error('[getMyProjectList] failed:', err && err.message ? err.message : err);
    return { success: false, error: 'query failed' };
  }
};

function queryConstructionProjects(openid, statuses) {
  return db.collection('construction_projects')
    .where(_.and([
      { status: _.in(statuses) },
      _.or([
        { contractorId: openid },
        { constructorId: openid },
        { team_openid: openid }
      ])
    ]))
    .field({
      title: true,
      issueId: true,
      status: true,
      currentStage: true,
      stages: true,
      progress: true,
      createTime: true,
      updateTime: true,
      location: true,
      address: true
    })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data || []);
}

function queryLegacyIssues(openid, statuses) {
  return db.collection('issues')
    .where({
      contractorId: openid,
      status: _.in(statuses)
    })
    .field({
      title: true,
      description: true,
      status: true,
      currentNode: true,
      createTime: true,
      location: true,
      address: true
    })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
    .then((res) => res.data || [])
    .catch(() => []);
}

function toTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (value.toDate) return value.toDate().getTime() || 0;
  if (value.$date) return new Date(value.$date).getTime() || 0;
  return 0;
}
