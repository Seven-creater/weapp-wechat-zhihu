// cloudfunctions/getPublicData/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 分类映射（ID -> 名称）
const CATEGORY_MAP = {
  'parking': '无障碍停车位',
  'restroom': '无障碍卫生间',
  'ramp': '无障碍坡道',
  'elevator': '无障碍电梯',
  'lift': '无障碍升降台',
  'service': '无障碍服务台',
  'passage': '无障碍通道',
  'entrance': '无障碍出入口',
  'door': '无障碍门',
  'steps': '台阶',
  'handrail': '扶手',
  'tactile': '盲道',
  'curb': '缘石坡道'
};

// 根据ID获取分类名称
function getCategoryNameById(id) {
  return CATEGORY_MAP[id] || '';
}

exports.main = async (event, context) => {
  try {
    const {
      collection,
      docId,
      page = 1,
      pageSize = 20,
      orderBy = 'createTime',
      order = 'desc',
      type,
      status,
      category,
      authorOpenids
    } = event;

    // 验证集合名称
    if (!collection) {
      return {
        success: false,
        error: '缺少集合名称'
      };
    }

    // 如果有 docId，查询单个文档
    if (docId) {
      const result = await db.collection(collection).doc(docId).get();
      
      if (!result.data) {
        return {
          success: false,
          error: '文档不存在'
        };
      }

      // 转换云存储图片URL
      const posts = await convertCloudImages([result.data]);
      
      return {
        success: true,
        data: posts[0]
      };
    }

    // 构建查询条件
    const where = {};

    // 按类型筛选
    if (type) {
      where.type = type;
    }

    // 按状态筛选（案例板块用）
    if (status) {
      where.status = status;
    }

    // 按分类筛选（案例板块用）
    // 同时匹配 category（ID）和 categoryName（名称），兼容旧数据
    if (category) {
      where.category = _.or([
        _.eq(category),  // 匹配新数据的ID
        _.eq(getCategoryNameById(category))  // 匹配旧数据的名称
      ]);
    }

    // 按作者筛选（关注列表用）
    if (authorOpenids && Array.isArray(authorOpenids) && authorOpenids.length > 0) {
      where._openid = _.in(authorOpenids);
    }

    // 计算跳过的记录数
    const skip = (page - 1) * pageSize;

    // 查询数据
    const result = await db.collection(collection)
      .where(where)
      .orderBy(orderBy, order)
      .skip(skip)
      .limit(pageSize)
      .get();

    // 转换云存储图片URL
    const posts = await convertCloudImages(result.data);

    // 检查是否还有更多数据
    const hasMore = posts.length >= pageSize;

    return {
      success: true,
      data: posts,
      pagination: {
        page,
        pageSize,
        hasMore
      }
    };

  } catch (err) {
    console.error('查询数据失败:', err);
    return {
      success: false,
      error: err.message || '查询失败'
    };
  }
};

// 转换云存储图片URL
async function convertCloudImages(posts) {
  const cloudUrls = [];
  
  posts.forEach(item => {
    if (item.images && Array.isArray(item.images)) {
      item.images.forEach(url => {
        if (url && url.indexOf('cloud://') === 0) {
          cloudUrls.push(url);
        }
      });
    }
  });

  if (cloudUrls.length === 0) {
    return posts;
  }

  try {
    const unique = Array.from(new Set(cloudUrls));
    const res = await cloud.getTempFileURL({ fileList: unique });
    
    const mapping = new Map();
    (res.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) {
        mapping.set(file.fileID, file.tempFileURL);
      }
    });

    return posts.map(item => {
      if (item.images && Array.isArray(item.images)) {
        item.images = item.images.map(url => {
          if (mapping.has(url)) {
            return mapping.get(url);
          }
          return url;
        });
      }
      return item;
    });
  } catch (err) {
    console.error('转换图片URL失败:', err);
    return posts;
  }
}

