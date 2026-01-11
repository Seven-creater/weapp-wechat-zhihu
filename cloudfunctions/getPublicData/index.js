// 云函数：获取公开数据（解决云存储权限问题，同时处理帖子图片和用户头像）
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
    
    // 2. 提取所有需要转换的 URL（包含帖子图片和用户头像）
    const allUrls = [];
    const urlMap = new Map(); // fileID -> tempURL
    
    data.forEach(doc => {
      // 2.1 处理用户头像 (userInfo.avatarUrl)
      if (doc.userInfo && doc.userInfo.avatarUrl) {
        const avatarUrl = doc.userInfo.avatarUrl;
        if (avatarUrl.startsWith('cloud://')) {
          if (!urlMap.has(avatarUrl)) {
            urlMap.set(avatarUrl, null);
            allUrls.push(avatarUrl);
            console.log('发现用户头像URL:', avatarUrl);
          }
        }
      }
      
      // 2.2 处理单个图片字段
      const singleImageFields = ['imageUrl', 'beforeImg', 'coverImage'];
      singleImageFields.forEach(field => {
        if (doc[field] && doc[field].startsWith('cloud://')) {
          if (!urlMap.has(doc[field])) {
            urlMap.set(doc[field], null);
            allUrls.push(doc[field]);
            console.log('发现帖子图片URL:', doc[field]);
          }
        }
      });
      
      // 2.3 处理图片数组字段
      const arrayImageFields = ['images'];
      arrayImageFields.forEach(field => {
        if (Array.isArray(doc[field])) {
          doc[field].forEach(imgUrl => {
            if (imgUrl && imgUrl.startsWith('cloud://')) {
              if (!urlMap.has(imgUrl)) {
                urlMap.set(imgUrl, null);
                allUrls.push(imgUrl);
                console.log('发现帖子多图URL:', imgUrl);
              }
            }
          });
        }
      });
    });
    
    console.log(`共发现 ${allUrls.length 个需要转换的URL`);
    
    // 3. 批量获取临时 URL
    if (allUrls.length > 0) {
      console.log(`开始转换 ${allUrls.length} 个URL...`);
      
      try {
        // 批量获取（微信云函数限制每次最多50个URL）
        const chunkSize = 50;
        for (let i = 0; i < allUrls.length; i += chunkSize) {
          const chunk = allUrls.slice(i, i + chunkSize);
          
          const urlRes = await cloud.getTempFileURL({
            fileList: chunk,
          });
          
          if (urlRes.fileList) {
            urlRes.fileList.forEach((item, index) => {
              if (item.tempFileURL) {
                urlMap.set(chunk[index], item.tempFileURL);
              }
            });
          }
        }
        
        console.log(`成功转换 ${allUrls.length} 个URL`);
      } catch (urlErr) {
        console.error('获取临时URL失败:', urlErr);
        // 继续处理，不中断返回
      }
    }
    
    // 4. 替换数据中的 URL（包含帖子图片和用户头像）
    const processedData = data.map(doc => {
      const processedDoc = { ...doc };
      
      // 4.1 处理用户头像（确保 userInfo 存在且头像已转换）
      if (!processedDoc.userInfo) {
        // 如果 userInfo 为空，设置为默认匿名用户信息
        processedDoc.userInfo = {
          nickName: '匿名用户',
          avatarUrl: '/images/default-avatar.png'
        };
      } else {
        // 转换头像 URL
        if (processedDoc.userInfo.avatarUrl && 
            processedDoc.userInfo.avatarUrl.startsWith('cloud://')) {
          const tempUrl = urlMap.get(processedDoc.userInfo.avatarUrl);
          if (tempUrl) {
            processedDoc.userInfo.avatarUrl = tempUrl;
          }
        }
        
        // 确保 nickName 存在
        if (!processedDoc.userInfo.nickName) {
          processedDoc.userInfo.nickName = '匿名用户';
        }
      }
      
      // 4.2 处理单个图片字段
      const singleImageFields = ['imageUrl', 'beforeImg', 'coverImage'];
      singleImageFields.forEach(field => {
        if (processedDoc[field] && processedDoc[field].startsWith('cloud://')) {
          const tempUrl = urlMap.get(processedDoc[field]);
          if (tempUrl) {
            processedDoc[field] = tempUrl;
          }
        }
      });
      
      // 4.3 处理图片数组字段
      const arrayImageFields = ['images'];
      arrayImageFields.forEach(field => {
        if (Array.isArray(processedDoc[field])) {
          processedDoc[field] = processedDoc[field].map(imgUrl => {
            if (imgUrl && imgUrl.startsWith('cloud://')) {
              const tempUrl = urlMap.get(imgUrl);
              return tempUrl || imgUrl; // 如果转换失败，保留原URL
            }
            return imgUrl;
          });
        }
      });
      
      return processedDoc;
    });
    
    // 5. 获取总数（用于分页）
    let total = 0;
    try {
      const countRes = await db.collection(collection).count();
      total = countRes.total;
    } catch (countErr) {
      console.error('获取总数失败:', countErr);
    }
    
    // 6. 返回数据
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
        urlConverted: allUrls.length,
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
