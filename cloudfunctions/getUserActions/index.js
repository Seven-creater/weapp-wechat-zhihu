// 云函数：获取用户的点赞和收藏记录
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { targetId, type, page = 1, pageSize = 20 } = event;

  // 验证参数
  if (!targetId) {
    return {
      success: false,
      error: '缺少 targetId 参数'
    };
  }

  try {
    console.log(`查询用户 ${targetId} 的 ${type} 记录`);

    // 构建查询条件
    let query = {
      _openid: targetId
    };

    // 根据类型过滤
    if (type === 'like') {
      // 点赞记录
      query.type = _.in(['like_post', 'like_solution', 'like']);
    } else if (type === 'collect') {
      // 收藏记录
      query.type = _.in(['collect_post', 'collect_solution', 'collect']);
    } else {
      // 所有记录
      query.type = _.in(['like_post', 'like_solution', 'like', 'collect_post', 'collect_solution', 'collect']);
    }

    // 查询 actions 集合
    const res = await db.collection('actions')
      .where(query)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const actions = res.data || [];
    console.log(`查询到 ${actions.length} 条记录`);

    // 提取目标ID和集合类型
    const postIds = [];
    const solutionIds = [];

    actions.forEach(action => {
      const targetId = action.targetId || action.postId;
      const actionType = String(action.type || '');
      const collection = action.targetCollection || 
        (actionType.indexOf('solution') > -1 ? 'solutions' : 'posts');

      if (collection === 'solutions' && targetId) {
        solutionIds.push(targetId);
      } else if (targetId) {
        postIds.push(targetId);
      }
    });

    // 批量查询帖子和案例详情
    const [postsRes, solutionsRes] = await Promise.all([
      postIds.length > 0 
        ? db.collection('posts').where({ _id: _.in(postIds) }).get()
        : Promise.resolve({ data: [] }),
      solutionIds.length > 0
        ? db.collection('solutions').where({ _id: _.in(solutionIds) }).get()
        : Promise.resolve({ data: [] })
    ]);

    // 构建映射
    const postMap = new Map();
    const solutionMap = new Map();

    (postsRes.data || []).forEach(post => {
      postMap.set(post._id, post);
    });

    (solutionsRes.data || []).forEach(solution => {
      solutionMap.set(solution._id, solution);
    });

    // 合并数据
    const enrichedActions = actions.map(action => {
      const targetId = action.targetId || action.postId;
      const actionType = String(action.type || '');
      const collection = action.targetCollection || 
        (actionType.indexOf('solution') > -1 ? 'solutions' : 'posts');

      let targetData = null;
      if (collection === 'solutions') {
        targetData = solutionMap.get(targetId);
      } else {
        targetData = postMap.get(targetId);
      }

      // 提取标题和图片
      let title = action.title || '未命名内容';
      let image = action.image || '/images/24213.jpg';

      if (targetData) {
        const titleSource = targetData.title || targetData.description || targetData.content || '';
        title = String(titleSource).split('\n')[0].slice(0, 40) || '未命名内容';
        
        // 提取图片
        if (targetData.images && targetData.images.length > 0) {
          image = targetData.images[0];
        } else if (targetData.coverImage) {
          image = targetData.coverImage;
        } else if (targetData.beforeImg) {
          image = targetData.beforeImg;
        } else if (targetData.imageUrl) {
          image = targetData.imageUrl;
        }
      }

      return {
        ...action,
        title,
        image,
        targetCollection: collection,
        targetRoute: collection === 'solutions' 
          ? '/pages/solution-detail/index'
          : '/pages/post-detail/index'
      };
    });

    // 转换云存储URL
    const cloudUrls = enrichedActions
      .map(item => item.image)
      .filter(url => url && url.startsWith('cloud://'));

    if (cloudUrls.length > 0) {
      const uniqueUrls = [...new Set(cloudUrls)];
      const urlRes = await cloud.getTempFileURL({ fileList: uniqueUrls });
      
      const urlMap = new Map();
      (urlRes.fileList || []).forEach(file => {
        if (file.tempFileURL) {
          urlMap.set(file.fileID, file.tempFileURL);
        }
      });

      enrichedActions.forEach(item => {
        if (item.image && item.image.startsWith('cloud://')) {
          item.image = urlMap.get(item.image) || item.image;
        }
      });
    }

    // 查询总数
    const countRes = await db.collection('actions').where(query).count();
    const total = countRes.total || 0;

    return {
      success: true,
      data: enrichedActions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total
      }
    };

  } catch (err) {
    console.error('查询用户行为失败:', err);
    return {
      success: false,
      error: err.message || '查询失败',
      details: err
    };
  }
};

