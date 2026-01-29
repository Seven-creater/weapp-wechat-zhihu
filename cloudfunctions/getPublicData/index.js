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
    category,
    status,
    type,
    sourceIssueId,
    authorOpenids,
    near,
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
                  (f) => f.fileID === imgUrl,
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
              (f) => f.fileID === data.userInfo.avatarUrl,
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
                (f) => f.fileID === data[field],
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
                (f) => f.fileID === data[field],
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
          avatarUrl: "/images/zhi.png",
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
      }`,
    );

    let query = db.collection(collection);
    let baseConditions = [];
    let nearApplied = false;

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
    else {
      if (collection === "solutions") {
        if (category && String(category).trim())
          baseConditions.push({ category });
        if (status && String(status).trim()) baseConditions.push({ status });
        if (sourceIssueId && String(sourceIssueId).trim())
          baseConditions.push({ sourceIssueId });
        if (near && typeof near === "object") {
          const lat = Number(near.latitude);
          const lng = Number(near.longitude);
          const maxDistance = Number(near.maxDistance);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            nearApplied = true;
            baseConditions.push({
              location: _.geoNear({
                geometry: new db.Geo.Point(lng, lat),
                maxDistance: Number.isFinite(maxDistance) ? maxDistance : 5000,
                minDistance: 0,
              }),
            });
          }
        }
      } else if (collection === "posts") {
        if (type && String(type).trim()) baseConditions.push({ type });
        if (Array.isArray(authorOpenids)) {
          const ids = authorOpenids.filter(Boolean).slice(0, 100);
          if (ids.length > 0) baseConditions.push({ _openid: _.in(ids) });
        }
      } else if (collection === "issues") {
        if (status && String(status).trim()) baseConditions.push({ status });
        if (near && typeof near === "object") {
          const lat = Number(near.latitude);
          const lng = Number(near.longitude);
          const maxDistance = Number(near.maxDistance);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            nearApplied = true;
            baseConditions.push({
              location: _.geoNear({
                geometry: new db.Geo.Point(lng, lat),
                maxDistance: Number.isFinite(maxDistance) ? maxDistance : 5000,
                minDistance: 0,
              }),
            });
          }
        }
      }

      if (keyword && keyword.trim()) {
        const reg = db.RegExp({ regexp: keyword.trim(), options: "i" });
        let keywordCondition = null;

        if (collection === "solutions") {
          keywordCondition = _.or([
            { title: reg },
            { description: reg },
            { aiAnalysis: reg },
          ]);
        } else if (collection === "posts") {
          keywordCondition = _.or([
            { content: reg },
            { aiDiagnosis: reg },
            { aiSolution: reg },
          ]);
        } else if (collection === "issues") {
          keywordCondition = _.or([{ description: reg }, { content: reg }]);
        }

        if (keywordCondition) baseConditions.push(keywordCondition);
        console.log(`关键词搜索: ${keyword}`);
      }

      if (baseConditions.length === 1) {
        query = query.where(baseConditions[0]);
      } else if (baseConditions.length > 1) {
        query = query.where(_.and(baseConditions));
      }
    }

    // 添加排序
    query = query.orderBy(orderBy, order);

    // 添加分页
    query = query.skip((page - 1) * pageSize).limit(pageSize);

    const runQuery = async (conditions) => {
      let q = db.collection(collection);
      if (conditions.length === 1) {
        q = q.where(conditions[0]);
      } else if (conditions.length > 1) {
        q = q.where(_.and(conditions));
      }
      q = q.orderBy(orderBy, order);
      q = q.skip((page - 1) * pageSize).limit(pageSize);
      return q.get();
    };

    let res;
    try {
      res = await query.get();
    } catch (err) {
      const msg = String((err && (err.message || err.errMsg)) || "");
      const isGeoNearIndexError =
        msg.includes("unable to find index for $geoNear") ||
        (msg.includes("$geoNear") && msg.includes("index"));

      if (nearApplied && isGeoNearIndexError) {
        console.log("geoNear 缺少索引，自动回退为非附近查询");
        const withoutNear = baseConditions.filter((c) => {
          if (!c || typeof c !== "object") return true;
          const loc = c.location;
          if (!loc || typeof loc !== "object") return true;
          return !(
            Object.prototype.hasOwnProperty.call(loc, "$geoNear") ||
            String(JSON.stringify(loc)).includes("$geoNear")
          );
        });
        res = await runQuery(withoutNear);
      } else {
        throw err;
      }
    }
    let list = res.data || [];

    if (collection === "actions") {
      list = await Promise.all(
        list.map(async (doc) => {
          const normalized = { ...doc };
          if (normalized.type === "collect") {
            normalized.type = "collect_post";
          }

          const targetId = normalized.targetId || normalized.postId;

          if (!normalized.targetCollection) {
            normalized.targetCollection =
              normalized.type && normalized.type.indexOf("solution") >= 0
                ? "solutions"
                : "posts";
          }

          if (!normalized.targetRoute && normalized.targetCollection) {
            normalized.targetRoute =
              normalized.targetCollection === "solutions"
                ? "/pages/solution-detail/index"
                : "/pages/post-detail/index";
          }

          const needTitle = !normalized.title;
          const needImage = !normalized.image;

          if (
            (needTitle || needImage) &&
            targetId &&
            normalized.targetCollection
          ) {
            try {
              const targetRes = await db
                .collection(normalized.targetCollection)
                .doc(targetId)
                .get();
              const targetData = targetRes.data || {};

              if (needTitle) {
                const titleSource =
                  targetData.title ||
                  targetData.description ||
                  targetData.content ||
                  "";
                if (titleSource) {
                  normalized.title = String(titleSource).slice(0, 30);
                }
              }

              if (needImage) {
                normalized.image =
                  targetData.image ||
                  targetData.coverImg ||
                  targetData.beforeImg ||
                  targetData.imageUrl ||
                  targetData.coverImage ||
                  targetData.afterImg ||
                  (Array.isArray(targetData.images)
                    ? targetData.images[0]
                    : "") ||
                  "";
              }
            } catch (err) {
              console.error("回填收藏信息失败:", err);
            }
          }

          return normalized;
        }),
      );
    }

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
                avatarUrl: user.avatarUrl || "/images/zhi.png",
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
          avatarUrl: authorInfo.avatarUrl || "/images/zhi.png",
          _openid: doc._openid,
        };
      } else if (!processedDoc.userInfo) {
        // 没有用户信息时使用默认值
        processedDoc.userInfo = {
          nickName: "匿名用户",
          avatarUrl: "/images/zhi.png",
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
      // 特殊处理：actions 集合的数据标准化
      // ============================================
      if (collection === "actions" && processedDoc.createTime) {
        // 调试日志
        console.log(
          `[调试] 处理 actions 记录: _id=${processedDoc._id}, type=${processedDoc.type}`,
        );
        console.log(
          `[调试] 原始图片字段: image=${processedDoc.image}, coverImg=${processedDoc.coverImg}`,
        );

        // 确保图片字段有值
        const rawImage = processedDoc.image || processedDoc.coverImg || "";

        // 如果图片是 cloud:// 开头，从 urlMap 获取转换后的 URL
        let finalImage = rawImage;
        if (rawImage && rawImage.startsWith("cloud://")) {
          finalImage = urlMap.get(rawImage) || rawImage;
        }

        // 确保 image 字段是有效的 https URL 或默认图片
        if (!finalImage || !finalImage.startsWith("http")) {
          finalImage = urlMap.get(processedDoc.coverImg) || "/images/zhi.png";
        }

        processedDoc.image = finalImage;

        console.log(`[调试] 最终图片URL: ${processedDoc.image}`);

        // 时间格式化
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
      }

      return processedDoc;
    });

    // 获取总数（用于分页）
    let total = 0;
    let hasMore = false;

    try {
      let countQuery = db.collection(collection);

      if (collection === "actions") {
        countQuery = countQuery.where({
          _openid: openid,
          type: _.in(["collect_solution", "collect_post", "collect"]),
        });
      } else if (baseConditions.length === 1) {
        countQuery = countQuery.where(baseConditions[0]);
      } else if (baseConditions.length > 1) {
        countQuery = countQuery.where(_.and(baseConditions));
      }

      const countRes = await countQuery.count();
      total = countRes.total;
      hasMore = page * pageSize < total;
    } catch (countErr) {
      console.error("获取总数失败:", countErr);
      total = processedData.length;
      hasMore = processedData.length >= pageSize;
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
        hasMore,
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
