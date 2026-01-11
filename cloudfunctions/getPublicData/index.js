// 云函数：获取公开数据（解决云存储权限问题）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { collection, page = 1, pageSize = 10, orderBy = 'createTime', order = 'desc' } = event;
  
  // 验证参数
  const validCollections = ['posts', 'solutions', 'issues'];
  if (!collection || !validCollections.includes(collection)) {
    return {
      success: false,
      error: '无效的集合名称',
      validCollections
    };
  }
  
  try {
    console.log(`开始查询集合: ${collection}, 页码: ${page}, 每页: ${pageSize}`);
    
    // 1. 管理员查询：无视读写权限，直接获取数据
    let query = db.collection(collection);
    
    // 添加排序
    query = query.orderBy(orderBy, order);
    
    // 添加分页
    query = query.skip((page - 1) * pageSize).limit(pageSize);
    
    const res = await query.get();
    const data = res.data;
    
    console.log(`查询到 ${data.length} 条记录`);
    
    // 2. 图片“洗白”：将 fileID 转换为临时 HTTPS URL
    const imageUrls = [];
    const imageUrlMap = new Map(); // fileID -> tempURL
    
    // 提取所有需要转换的图片 URL
    data.forEach(doc => {
      // 处理单个图片字段
      const singleImageFields = ['imageUrl', 'beforeImg', 'coverImage'];
      singleImageFields.forEach(field => {
        if (doc[field] && doc[field].startsWith('cloud://')) {
          if (!imageUrlMap.has(doc[field])) {
            imageUrlMap.set(doc[field], null);
            imageUrls.push(doc[field]);
          }
        }
      });
      
      // 处理图片数组字段
      const arrayImageFields = ['images'];
      arrayImageFields.forEach(field => {
        if (Array.isArray(doc[field])) {
          doc[field].forEach(imgUrl => {
            if (imgUrl && imgUrl.startsWith('cloud://')) {
              if (!imageUrlMap.has(imgUrl)) {
                imageUrlMap.set(imgUrl, null);
                imageUrls.push(imgUrl);
              }
            }
          });
        }
      });
    });
    
    // 批量获取临时 URL
    let tempUrlResults = [];
    if (imageUrls.length > 0) {
      console.log(`需要转换 ${imageUrls.length} 个图片URL`);
      
      try {
        const urlRes = await cloud.getTempFileURL({
          fileList: imageUrls,
        });
        
        if (urlRes.fileList) {
          tempUrlResults = urlRes.fileList;
          
          // 建立映射关系
          tempUrlResults.forEach((item, index) => {
            if (item.tempFileURL) {
              imageUrlMap.set(imageUrls[index], item.tempFileURL);
            }
          });
          
          console.log(`成功转换 ${tempUrlResults.length} 个图片URL`);
        }
      } catch (urlErr) {
        console.error('获取临时URL失败:', urlErr);
        // 继续处理，不中断返回
      }
    }
    
    // 3. 替换数据中的图片 URL
    const processedData = data.map(doc => {
      const processedDoc = { ...doc };
      
      // 处理单个图片字段
      const singleImageFields = ['imageUrl', 'beforeImg', 'coverImage'];
      singleImageFields.forEach(field => {
        if (processedDoc[field] && processedDoc[field].startsWith('cloud://')) {
          const tempUrl = imageUrlMap.get(processedDoc[field]);
          if (tempUrl) {
            processedDoc[field] = tempUrl;
          }
        }
      });
      
      // 处理图片数组字段
      const arrayImageFields = ['images'];
      arrayImageFields.forEach(field => {
        if (Array.isArray(processedDoc[field])) {
          processedDoc[field] = processedDoc[field].map(imgUrl => {
            if (imgUrl && imgUrl.startsWith('cloud://')) {
              const tempUrl = imageUrlMap.get(imgUrl);
              return tempUrl || imgUrl; // 如果转换失败，保留原URL
            }
            return imgUrl;
          });
        }
      });
      
      return processedDoc;
    });
    
    // 4. 获取总数（用于分页）
    let total = 0;
    try {
      const countRes = await db.collection(collection).count();
      total = countRes.total;
    } catch (countErr) {
      console.error('获取总数失败:', countErr);
    }
    
    // 5. 返回数据
    return {
      success: true,
      data: processedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total
      },
      meta: {
        imageConverted: imageUrls.length,
        timestamp: Date.now()
      }
    };
    
  } catch (err) {
    console.error('获取数据失败:', err);
    return {
      success: false,
      error: err.message || '获取数据失败',
      details: err
    };
  }
};
