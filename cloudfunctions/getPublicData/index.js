// 云函数：获取公开数据（解决云存储权限问题，支持列表和单条详情查询、关键词搜索）
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const {
    collection,
    page = 1,
    pageSize = 10,
    orderBy = "createTime",
    order = "desc",
    docId,
    keyword,
  } = event;

  // 验证参数
  const validCollections = ["posts", "solutions", "issues", "actions"];
  if (!collection || !validCollections.includes(collection)) {
    return {
      success: false,
      error: "无效的集合名称",
      validCollections,
    };
  }

  // 获取用户身份
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // ============================================
    // A. 如果传了 docId，查单条详情
    // ============================================
    if (docId) {
      // ... (保持原有单条查询逻辑不变)
      console.log(`开始查询单条详情: ${collection}, _id: ${docId}`);

      const res = await db.collection(collection).doc(docId).get();
      let data = res.data;

      if (!data) {
        return {
          success: false,
          error: "记录不存在",
        };
      }

      // 图片处理逻辑 (保持不变) ...
      const fileList = [];

      if (collection === "posts") {
        if (Array.isArray(data.images)) {
          data.images.forEach((imgUrl) => {
            if (imgUrl && imgUrl.startsWith("cloud://")) {
              fileList.push(imgUrl);
            }
          });
        }
        if (
          data.userInfo &&
          data.userInfo.avatarUrl &&
          data.userInfo.avatarUrl.startsWith("cloud://")
        ) {
          fileList.push(data.userInfo.avatarUrl);
        }
      } else if (collection === "solutions") {
        const solutionImageFields = [
          "beforeImg",
          "afterImg",
          "imageUrl",
          "coverImage",
        ];
        solutionImageFields.forEach((field) => {
          if (data[field] && data[field].startsWith("cloud://")) {
            fileList.push(data[field]);
          }
        });
      } else if (collection === "issues") {
        const issueImageFields = ["imageUrl", "beforeImg"];
        issueImageFields.forEach((field) => {
          if (data[field] && data[field].startsWith("cloud://")) {
            fileList.push(data[field]);
          }
        });
      }

      if (fileList.length > 0) {
        const urlRes = await cloud.getTempFileURL({ fileList });
        if (urlRes.fileList) {
          urlRes.fileList.forEach((item, index) => {
            if (item.tempFileURL) {
              fileList[index] = item.tempFileURL;
            }
          });
        }

        if (collection === "posts") {
          if (Array.isArray(data.images)) {
            data.images = data.images.map((imgUrl) => {
              if (imgUrl && imgUrl.startsWith("cloud://")) {
                const tempUrl = urlRes.fileList.find(
                  (f) => f.fileID === imgUrl
                )?.tempFileURL;
                return tempUrl || imgUrl;
              }
              return imgUrl;
            });
          }
          if (
            data.userInfo &&
            data.userInfo.avatarUrl &&
            data.userInfo.avatarUrl.startsWith("cloud://")
          ) {
            const tempUrl = urlRes.fileList.find(
              (f) => f.fileID === data.userInfo.avatarUrl
            )?.tempFileURL;
            if (tempUrl) {
              data.userInfo.avatarUrl = tempUrl;
            }
          }
        } else if (collection === "solutions") {
          const solutionImageFields = [
            "beforeImg",
            "afterImg",
            "imageUrl",
            "coverImage",
          ];
          solutionImageFields.forEach((field) => {
            if (data[field] && data[field].startsWith("cloud://")) {
              const tempUrl = urlRes.fileList.find(
                (f) => f.fileID === data[field]
              )?.tempFileURL;
              if (tempUrl) {
                data[field] = tempUrl;
              }
            }
          });
        } else if (collection === "issues") {
          const issueImageFields = ["imageUrl", "beforeImg"];
          issueImageFields.forEach((field) => {
            if (data[field] && data[field].startsWith("cloud://")) {
              const tempUrl = urlRes.fileList.find(
                (f) => f.fileID === data[field]
              )?.tempFileURL;
              if (tempUrl) {
                data[field] = tempUrl;
              }
            }
          });
        }
      }

      if (!data.userInfo) {
        data.userInfo = {
          nickName: "匿名用户",
          avatarUrl: "/images/default-avatar.png",
        };
      } else if (!data.userInfo.nickName) {
        data.userInfo.nickName = "匿名用户";
      }

      return {
        success: true,
        data: data,
        isDetail: true,
      };
    }

    // ============================================
    // B. 关键词搜索 或 列表查询
    // ============================================
    console.log(
      `开始查询集合: ${collection}, 页码: ${page}, 每页: ${pageSize}, 关键词: ${
        keyword || "无"
      }`
    );

    let query = db.collection(collection);

    // ============================================
    // B1. 如果是 actions 集合，查询当前用户的收藏
    // ============================================
    if (collection === "actions") {
      query = query.where({
        _openid: openid,
        type: _.in(["collect_solution", "collect_post", "collect"]),
      });
      console.log(`查询用户收藏列表: ${openid}`);
    }
    // ============================================
    // B2. 如果有关键词，添加模糊查询条件
    // ============================================
    else if (keyword && keyword.trim()) {
      const reg = db.RegExp({ regexp: keyword.trim(), options: "i" });

      if (collection === "solutions") {
        // 方案库：匹配 title, description, aiAnalysis
        query = query.where(
          _.or([{ title: reg }, { description: reg }, { aiAnalysis: reg }])
        );
      } else if (collection === "posts") {
        // 社区帖子：匹配 content, aiDiagnosis, aiSolution
        query = query.where(
          _.or([{ content: reg }, { aiDiagnosis: reg }, { aiSolution: reg }])
        );
      } else if (collection === "issues") {
        // 随手拍：匹配 description, content
        query = query.where(_.or([{ description: reg }, { content: reg }]));
      }

      console.log(`关键词搜索: ${keyword}`);
    }

    // 添加排序
    query = query.orderBy(orderBy, order);

    // 添加分页
    query = query.skip((page - 1) * pageSize).limit(pageSize);

    const res = await query.get();
    const list = res.data;

    console.log(`查询到 ${list.length} 条记录`);

    // ============================================
    // C. 用户中心化：关联查询 users 集合获取最新用户资料
    // ============================================
    let authorMap = new Map();

    if (["posts", "issues"].includes(collection) && list.length > 0) {
      // 提取所有不重复的作者 ID
      const authorIds = [
        ...new Set(list.map((item) => item._openid).filter(Boolean)),
      ];

      if (authorIds.length > 0) {
        console.log(`开始关联查询 ${authorIds.length} 个用户的最新资料`);

        try {
          // 批量查询用户资料
          const usersRes = await db
            .collection("users")
            .where({ _openid: _.in(authorIds) })
            .get();

          // 构建用户 Map：_openid -> 最新用户资料
          if (usersRes.data && usersRes.data.length > 0) {
            usersRes.data.forEach((user) => {
              authorMap.set(user._openid, {
                nickName: user.nickName || user.nickName || "匿名用户",
                avatarUrl: user.avatarUrl || "/images/default-avatar.png",
                _openid: user._openid,
              });
            });
          }

          console.log(`查询到 ${authorMap.size} 个用户的资料`);
        } catch (userErr) {
          console.error("查询用户资料失败:", userErr);
        }
      }
    }

    // ============================================
    // D. 图片链接洗白
    // ============================================
    const allUrls = [];
    const urlMap = new Map();

    list.forEach((doc) => {
      // 处理用户头像（从 users 集合获取的最新资料）
      const authorInfo = authorMap.get(doc._openid);
      if (authorInfo) {
        if (
          authorInfo.avatarUrl &&
          authorInfo.avatarUrl.startsWith("cloud://")
        ) {
          if (!urlMap.has(authorInfo.avatarUrl)) {
            urlMap.set(authorInfo.avatarUrl, null);
            allUrls.push(authorInfo.avatarUrl);
          }
        }
      } else if (
        doc.userInfo &&
        doc.userInfo.avatarUrl &&
        doc.userInfo.avatarUrl.startsWith("cloud://")
      ) {
        if (!urlMap.has(doc.userInfo.avatarUrl)) {
          urlMap.set(doc.userInfo.avatarUrl, null);
          allUrls.push(doc.userInfo.avatarUrl);
        }
      }

      // 处理单个图片字段
      let singleImageFields = [];
      if (collection === "posts") {
        singleImageFields = ["imageUrl"];
      } else if (collection === "solutions") {
        singleImageFields = ["beforeImg", "afterImg", "imageUrl", "coverImage"];
      } else if (collection === "issues") {
        singleImageFields = ["imageUrl", "beforeImg"];
      } else if (collection === "actions") {
        singleImageFields = ["image", "coverImg"];
      }

      singleImageFields.forEach((field) => {
        if (doc[field] && doc[field].startsWith("cloud://")) {
          if (!urlMap.has(doc[field])) {
            urlMap.set(doc[field], null);
            allUrls.push(doc[field]);
          }
        }
      });

      // 处理图片数组
      const arrayImageFields = ["images"];
      arrayImageFields.forEach((field) => {
        if (Array.isArray(doc[field])) {
          doc[field].forEach((imgUrl) => {
            if (imgUrl && imgUrl.startsWith("cloud://")) {
              if (!urlMap.has(imgUrl)) {
                urlMap.set(imgUrl, null);
                allUrls.push(imgUrl);
              }
            }
          });
        }
      });
    });

    // 批量获取临时 URL
    if (allUrls.length > 0) {
      try {
        const chunkSize = 50;
        for (let i = 0; i < allUrls.length; i += chunkSize) {
          const chunk = allUrls.slice(i, i + chunkSize);
          const urlRes = await cloud.getTempFileURL({ fileList: chunk });
          if (urlRes.fileList) {
            urlRes.fileList.forEach((item, index) => {
              if (item.tempFileURL) {
                urlMap.set(chunk[index], item.tempFileURL);
              }
            });
          }
        }
      } catch (urlErr) {
        console.error("获取临时URL失败:", urlErr);
      }
    }

    // 替换数据中的 URL 并合并用户资料
    const processedData = list.map((doc) => {
      const processedDoc = { ...doc };

      // ============================================
      // 关键：用户中心化 - 用最新用户资料覆盖旧数据
      // ============================================
      const authorInfo = authorMap.get(doc._openid);
      if (authorInfo) {
        // 使用 users 集合中的最新资料
        processedDoc.userInfo = {
          nickName: authorInfo.nickName || "匿名用户",
          avatarUrl: authorInfo.avatarUrl || "/images/default-avatar.png",
          _openid: doc._openid,
        };
      } else if (!processedDoc.userInfo) {
        // 没有用户信息时使用默认值
        processedDoc.userInfo = {
          nickName: "匿名用户",
          avatarUrl: "/images/default-avatar.png",
        };
      }

      // 转换用户头像 URL
      if (
        processedDoc.userInfo.avatarUrl &&
        processedDoc.userInfo.avatarUrl.startsWith("cloud://")
      ) {
        const tempUrl = urlMap.get(processedDoc.userInfo.avatarUrl);
        if (tempUrl) processedDoc.userInfo.avatarUrl = tempUrl;
      }

      // 处理单个图片字段
      let singleImageFields = [];
      if (collection === "posts") singleImageFields = ["imageUrl"];
      else if (collection === "solutions")
        singleImageFields = ["beforeImg", "afterImg", "imageUrl", "coverImage"];
      else if (collection === "issues")
        singleImageFields = ["imageUrl", "beforeImg"];
      else if (collection === "actions")
        singleImageFields = ["image", "coverImg"];

      singleImageFields.forEach((field) => {
        if (processedDoc[field] && processedDoc[field].startsWith("cloud://")) {
          const tempUrl = urlMap.get(processedDoc[field]);
          if (tempUrl) processedDoc[field] = tempUrl;
        }
      });

      // 处理图片数组
      const arrayImageFields = ["images"];
      arrayImageFields.forEach((field) => {
        if (Array.isArray(processedDoc[field])) {
          processedDoc[field] = processedDoc[field].map((imgUrl) => {
            if (imgUrl && imgUrl.startsWith("cloud://")) {
              const tempUrl = urlMap.get(imgUrl);
              return tempUrl || imgUrl;
            }
            return imgUrl;
          });
        }
      });

      // ============================================
      // 特殊处理：actions 集合的时间格式化
      // ============================================
      if (collection === "actions" && processedDoc.createTime) {
        let dateObj;
        if (processedDoc.createTime instanceof Date) {
          dateObj = processedDoc.createTime;
        } else if (typeof processedDoc.createTime === "number") {
          dateObj = new Date(processedDoc.createTime);
        } else if (typeof processedDoc.createTime === "string") {
          dateObj = new Date(processedDoc.createTime);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          processedDoc.formatTime = `${year}-${month}-${day}`;
        } else {
          processedDoc.formatTime = "";
        }

        if (processedDoc.type === "collect") {
          processedDoc.type = "collect_post";
        }

        if (!processedDoc.title) {
          processedDoc.title = "未命名项目";
        }

        if (!processedDoc.image) {
          processedDoc.image = processedDoc.coverImg || "";
        }
      }

      return processedDoc;
    });

    // 获取总数（用于分页）
    let total = 0;
    let hasMore = false;

    if (keyword && keyword.trim()) {
      // 关键词搜索时，需要统计符合条件的总数
      try {
        let countQuery = db.collection(collection);
        const reg = db.RegExp({ regexp: keyword.trim(), options: "i" });

        if (collection === "solutions") {
          countQuery = countQuery.where(
            _.or([{ title: reg }, { description: reg }, { aiAnalysis: reg }])
          );
        } else if (collection === "posts") {
          countQuery = countQuery.where(
            _.or([{ content: reg }, { aiDiagnosis: reg }, { aiSolution: reg }])
          );
        } else if (collection === "issues") {
          countQuery = countQuery.where(
            _.or([{ description: reg }, { content: reg }])
          );
        }

        const countRes = await countQuery.count();
        total = countRes.total;
        hasMore = page * pageSize < total;
      } catch (countErr) {
        console.error("获取总数失败:", countErr);
        total = data.length;
        hasMore = data.length >= pageSize;
      }
    } else {
      // 普通列表查询
      hasMore =
        page * pageSize < (await db.collection(collection).count()).total;
    }

    // 返回数据
    return {
      success: true,
      data: processedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: hasMore && keyword,
      },
      meta: {
        urlConverted: allUrls.length,
        timestamp: Date.now(),
        keyword: keyword || "",
      },
    };
  } catch (err) {
    console.error("获取数据失败:", err);
    return {
      success: false,
      error: err.message || "获取数据失败",
      details: err,
    };
  }
};
