const app = getApp();
const db = wx.cloud.database();
const ISSUE_DRAFT_KEY = "issueDraft";
const ISSUE_DRAFT_TEMP_KEY = "issueDraftTemp";

Page({
  data: {
    description: "",
    userSuggestion: "",
    images: [],
    aiSolution: "",
    location: null,
    address: "",
    formattedAddress: "",
    syncToCommunity: true,
    generatingAI: false,
    submitting: false,
    isRecording: false,
  },

  onLoad: function (options) {
    this.initVoiceInput();
    const fromCapture = options.fromCapture === "1";
    if (fromCapture) {
      this.initFromCapture();
      return;
    }
    this.checkDraftOnLoad();
  },

  onUnload: function () {
    if (this.skipDraftSave) return;
    if (this.draftDirty && !this.data.submitting) {
      this.saveDraft(true);
    }
    if (this.recognitionManager) {
      this.recognitionManager.stop();
    }
  },

  initVoiceInput: function () {
    try {
      const plugin = requirePlugin("WeChatSI");
      this.recognitionManager = plugin.getRecordRecognitionManager();

      this.recognitionManager.onStart = () => {
        console.log("开始录音");
        this.setData({ isRecording: true });
      };

      this.recognitionManager.onStop = (res) => {
        console.log("录音结束", res);
        this.setData({ isRecording: false });
        const result = res.result;

        if (result && result.trim()) {
          const currentDescription = this.data.description;
          const newDescription = currentDescription
            ? currentDescription + result
            : result;
          this.setData({ description: newDescription });
          this.draftDirty = true;
        } else {
          wx.vibrateShort();
          wx.showToast({
            title: "未识别到语音，请重试",
            icon: "none",
          });
        }
      };

      this.recognitionManager.onError = (err) => {
        console.error("语音识别错误:", err);
        this.setData({ isRecording: false });
        wx.vibrateShort();
        wx.showToast({
          title: "语音识别失败，请重试",
          icon: "none",
        });
      };
    } catch (err) {
      console.error("初始化语音插件失败:", err);
    }
  },

  streamRecord: function () {
    if (!this.recognitionManager) {
      wx.showToast({
        title: "语音功能初始化失败",
        icon: "none",
      });
      return;
    }
    wx.vibrateShort();
    this.recognitionManager.start({
      lang: "zh_CN",
      duration: 60000,
    });
    wx.showToast({
      title: "正在听...",
      icon: "none",
      duration: 1000,
    });
  },

  endStreamRecord: function () {
    if (this.recognitionManager) {
      this.recognitionManager.stop();
    }
  },

  initFromCapture: function () {
    const tempDraft = wx.getStorageSync(ISSUE_DRAFT_TEMP_KEY);
    wx.removeStorageSync(ISSUE_DRAFT_TEMP_KEY);

    if (!tempDraft || !Array.isArray(tempDraft.images)) {
      this.checkDraftOnLoad();
      return;
    }

    const location = this.normalizeLocation(tempDraft.location);

    this.persistImages(tempDraft.images)
      .then((savedPaths) => {
        const images = savedPaths.map((path) => ({
          path,
          isSaved: true,
        }));

        this.setData({
          images,
          location,
          address: location ? location.address : "",
          formattedAddress: location ? location.formattedAddress : "",
          syncToCommunity: true,
        });

        this.draftDirty = true;
        this.saveDraft(true);
      })
      .catch(() => {
        wx.showToast({
          title: "图片保存失败",
          icon: "none",
        });
      });
  },

  checkDraftOnLoad: function () {
    const draft = wx.getStorageSync(ISSUE_DRAFT_KEY);
    if (!draft || !this.hasDraftContent(draft)) {
      return;
    }

    wx.showModal({
      title: "发现草稿",
      content: "是否恢复上次编辑内容？",
      confirmText: "恢复",
      cancelText: "放弃",
      success: (res) => {
        if (res.confirm) {
          this.restoreDraft(draft);
        } else {
          this.clearDraftFiles(draft.images || []);
          wx.removeStorageSync(ISSUE_DRAFT_KEY);
        }
      },
    });
  },

  hasDraftContent: function (draft) {
    return (
      (draft.description && draft.description.trim()) ||
      (draft.images && draft.images.length > 0) ||
      (draft.aiSolution && draft.aiSolution.trim())
    );
  },

  restoreDraft: function (draft) {
    const location = this.normalizeLocation(draft.location);
    const images = (draft.images || []).map((path) => ({
      path,
      isSaved: true,
    }));

    this.setData({
      description: draft.description || "",
      images,
      aiSolution: draft.aiSolution || "",
      location,
      address: draft.address || (location ? location.address : ""),
      formattedAddress:
        draft.formattedAddress || (location ? location.formattedAddress : ""),
      syncToCommunity:
        typeof draft.syncToCommunity === "boolean"
          ? draft.syncToCommunity
          : true,
    });

    this.draftDirty = false;
  },

  normalizeLocation: function (location) {
    if (!location) return null;
    return {
      latitude: Number(location.latitude) || 0,
      longitude: Number(location.longitude) || 0,
      address: location.address || "",
      formattedAddress: location.formattedAddress || "",
    };
  },

  onDescriptionInput: function (e) {
    this.setData({
      description: e.detail.value,
    });
    this.draftDirty = true;
  },

  onSuggestionInput: function (e) {
    this.setData({
      userSuggestion: e.detail.value,
    });
    this.draftDirty = true;
  },

  onSyncChange: function (e) {
    this.setData({
      syncToCommunity: e.detail.value,
    });
    this.draftDirty = true;
  },

  chooseImage: function () {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;

    wx.chooseImage({
      count: remain,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths || [];
        if (tempFilePaths.length === 0) return;

        this.persistImages(tempFilePaths).then((savedPaths) => {
          const images = this.data.images.concat(
            savedPaths.map((path) => ({
              path,
              isSaved: true,
            }))
          );
          this.setData({ images });
          this.draftDirty = true;
        });
      },
      fail: (err) => {
        console.error("选择图片失败:", err);
        wx.showToast({
          title: "选择图片失败",
          icon: "none",
        });
      },
    });
  },

  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    const removed = images.splice(index, 1)[0];
    this.setData({ images });

    if (removed && removed.isSaved) {
      this.removeSavedFile(removed.path);
    }

    this.draftDirty = true;
  },

  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.images.map((item) => item.path);
    if (!current || urls.length === 0) return;

    wx.previewImage({
      current,
      urls,
    });
  },

  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        const location = {
          latitude: res.latitude,
          longitude: res.longitude,
          address: res.address || res.name || "",
          formattedAddress: res.address || res.name || "",
        };
        this.setData({
          location,
          address: location.address,
          formattedAddress: location.formattedAddress,
        });
        this.draftDirty = true;
      },
      fail: (err) => {
        console.error("选择位置失败:", err);
        wx.showToast({
          title: "选点失败",
          icon: "none",
        });
      },
    });
  },

  generateAISolution: function () {
    if (this.data.generatingAI) return;
    if (this.data.images.length === 0) {
      wx.showToast({
        title: "请先添加图片",
        icon: "none",
      });
      return;
    }

    const imagePath = this.data.images[0].path;
    const location = this.data.location || null;

    this.setData({ generatingAI: true });
    wx.showLoading({
      title: "AI生成中...",
      mask: true,
    });

    this.uploadSingleImage(imagePath, "issues/ai")
      .then((fileID) => {
        return wx.cloud.callFunction({
          name: "analyzeIssue",
          data: {
            fileID,
            location,
          },
        });
      })
      .then((res) => {
        const aiSolution =
          (res.result && res.result.aiSolution) ||
          (res.result && res.result.aiAnalysis) ||
          "";
        if (!aiSolution) {
          throw new Error("AI未返回方案");
        }
        this.setData({ aiSolution });
        this.draftDirty = true;
        this.saveDraft(true);
      })
      .catch((err) => {
        console.error("生成AI方案失败:", err);
        wx.showToast({
          title: "生成失败，请重试",
          icon: "none",
        });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ generatingAI: false });
      });
  },

  submitIssue: async function () {
    const { description, images, aiSolution, location, syncToCommunity } =
      this.data;

    if (this.data.submitting) return;

    if (!description.trim()) {
      wx.showToast({
        title: "请填写问题说明",
        icon: "none",
      });
      return;
    }

    if (!aiSolution.trim()) {
      wx.showToast({
        title: "请先生成AI方案",
        icon: "none",
      });
      return;
    }

    if (!location) {
      wx.showToast({
        title: "请先定位",
        icon: "none",
      });
      return;
    }

    if (!images || images.length === 0) {
      wx.showToast({
        title: "请添加图片",
        icon: "none",
      });
      return;
    }

    this.setData({ submitting: true });
    // 1. 开启 Loading (防止用户重复点击)
    wx.showLoading({ title: "正在安全检测...", mask: true });

    try {
      // ==========================================
      // 🛑 第一道关卡：登录检查
      // ==========================================
      await app.checkLogin().catch(() => {
        return new Promise((resolve, reject) => {
          wx.showModal({
            title: "提示",
            content: "请先登录",
            confirmText: "去登录",
            cancelText: "取消",
            success: (res) => {
              if (res.confirm) {
                app
                  .login()
                  .then(() => resolve())
                  .catch((err) => reject(err));
              } else {
                reject(new Error("未登录"));
              }
            },
          });
        });
      });

      // ==========================================
      // 🛑 第二道关卡：调用云函数检测问题描述
      // ==========================================
      const descSecRes = await wx.cloud.callFunction({
        name: "checkContent",
        data: { type: "text", value: description.trim() },
      });

      // 调试日志：看看云函数到底返回了什么
      console.log("问题描述安全检测结果:", descSecRes);

      // 🛑 检查检测结果
      if (descSecRes.result.code !== 0) {
        throw new Error("问题描述含有违法违规信息，禁止发布！");
      }

      // ==========================================
      // 🛑 第三道关卡：调用云函数检测AI方案
      // ==========================================
      const aiSecRes = await wx.cloud.callFunction({
        name: "checkContent",
        data: { type: "text", value: aiSolution.trim() },
      });

      // 调试日志：看看云函数到底返回了什么
      console.log("AI方案安全检测结果:", aiSecRes);

      // 🛑 检查检测结果
      if (aiSecRes.result.code !== 0) {
        throw new Error("AI方案含有违法违规信息，禁止发布！");
      }

      // ==========================================
      // ✅ 只有通过了上面三关，才能执行下面的代码！
      // ==========================================

      // 上传图片到云存储
      const fileIDs = await this.uploadImagesToCloud(
        images.map((item) => item.path)
      );

      // 保存问题和解决方案到数据库
      const issueId = await this.saveIssueAndSolution(
        fileIDs,
        description.trim(),
        aiSolution.trim(),
        location,
        syncToCommunity
      );

      this.clearDraft();
      wx.hideLoading();
      wx.showToast({
        title: "提交成功",
        icon: "success",
      });
      wx.navigateTo({
        url: "/pages/issue-detail/issue-detail?id=" + issueId,
      });
    } catch (err) {
      // ❌ 失败处理
      wx.hideLoading();
      console.error("拦截成功或出错:", err);

      if (err && err.message === "未登录") {
        this.setData({ submitting: false });
        return;
      }

      // 弹出红色警告，且**不清空输入框**（方便用户修改）
      wx.showModal({
        title: "发布失败",
        content: err.message || "内容包含敏感信息",
        showCancel: false,
        confirmText: "我知道了",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  saveIssueAndSolution: function (
    fileIDs,
    description,
    aiSolution,
    location,
    syncToCommunity
  ) {
    const { userSuggestion } = this.data;
    const coverImage = fileIDs[0];
    const issueData = {
      imageUrl: coverImage,
      images: fileIDs,
      description,
      userSuggestion,
      location: new db.Geo.Point(location.longitude, location.latitude),
      address: location.address,
      formattedAddress: location.formattedAddress,
      aiSolution,
      status: "pending",
      createTime: db.serverDate(),
    };

    const userInfo = app.globalData.userInfo || wx.getStorageSync("userInfo");

    return db
      .collection("issues")
      .add({ data: issueData })
      .then((res) => {
        const issueId = res._id;
        const title = description
          ? description.substring(0, 30)
          : `发现${location.address || "无障碍问题"}`;

        const locationPoint = new db.Geo.Point(
          location.longitude,
          location.latitude
        );

        const solutionData = {
          title,
          category: "轮椅通行",
          status: "跟进中",
          beforeImg: coverImage,
          aiAnalysis: aiSolution,
          userSuggestion,
          viewCount: 0,
          collectCount: 0,
          createTime: db.serverDate(),
          sourceIssueId: issueId,
          address: location.address,
          formattedAddress: location.formattedAddress,
          location: locationPoint,
        };

        const tasks = [db.collection("solutions").add({ data: solutionData })];

        if (syncToCommunity) {
          tasks.push(
            this.createCommunityPost(
              issueId,
              fileIDs,
              location,
              aiSolution,
              description,
              userInfo,
              userSuggestion
            )
          );
        }

        return Promise.all(tasks).then(() => issueId);
      });
  },

  createCommunityPost: function (
    issueId,
    images,
    location,
    aiSolution,
    description,
    userInfo,
    userSuggestion
  ) {
    const postData = {
      issueId,
      content: `${description}\nAI诊断：${aiSolution}`,
      images,
      type: "issue",
      userSuggestion,
      location: new db.Geo.Point(location.longitude, location.latitude),
      address: location.address,
      stats: { view: 0, like: 0, comment: 0 },
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      userInfo: userInfo || {
        nickName: "匿名用户",
        avatarUrl: "/images/default-avatar.png",
      },
    };

    return db.collection("posts").add({ data: postData });
  },

  uploadImagesToCloud: function (paths) {
    const uploads = paths.map((filePath, index) => {
      const fileExt = this.getFileExt(filePath);
      const cloudPath = `issues/${Date.now()}-${index}.${fileExt}`;
      return wx.cloud
        .uploadFile({
          cloudPath,
          filePath,
        })
        .then((res) => res.fileID);
    });

    return Promise.all(uploads);
  },

  uploadSingleImage: function (filePath, prefix) {
    const fileExt = this.getFileExt(filePath);
    const cloudPath = `${prefix}/${Date.now()}.${fileExt}`;
    return wx.cloud
      .uploadFile({
        cloudPath,
        filePath,
      })
      .then((res) => res.fileID);
  },

  getFileExt: function (filePath) {
    const parts = filePath.split(".");
    const ext = parts[parts.length - 1];
    return ext || "jpg";
  },

  persistImages: function (tempPaths) {
    return Promise.all(
      tempPaths.map((path) => {
        return new Promise((resolve) => {
          wx.saveFile({
            tempFilePath: path,
            success: (res) => resolve(res.savedFilePath),
            fail: () => resolve(path),
          });
        });
      })
    );
  },

  removeSavedFile: function (path) {
    wx.removeSavedFile({
      filePath: path,
      fail: () => {},
    });
  },

  clearDraftFiles: function (paths) {
    (paths || []).forEach((path) => {
      this.removeSavedFile(path);
    });
  },

  saveDraft: function (silent) {
    const draft = {
      description: this.data.description,
      images: this.data.images.map((item) => item.path),
      aiSolution: this.data.aiSolution,
      location: this.data.location,
      address: this.data.address,
      formattedAddress: this.data.formattedAddress,
      syncToCommunity: this.data.syncToCommunity,
      updatedAt: Date.now(),
    };

    wx.setStorageSync(ISSUE_DRAFT_KEY, draft);

    if (!silent) {
      wx.showToast({
        title: "草稿已保存",
        icon: "success",
      });
    }
  },

  clearDraft: function () {
    const paths = this.data.images.map((item) => item.path);
    this.clearDraftFiles(paths);
    wx.removeStorageSync(ISSUE_DRAFT_KEY);
    this.skipDraftSave = true;
    this.draftDirty = false;
  },

  handleCancel: function () {
    if (
      !this.hasDraftContent({
        description: this.data.description,
        images: this.data.images.map((item) => item.path),
        aiSolution: this.data.aiSolution,
      })
    ) {
      wx.navigateBack();
      return;
    }

    wx.showActionSheet({
      itemList: ["保存草稿并退出", "放弃草稿"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.saveDraft(false);
          this.skipDraftSave = true;
          wx.navigateBack();
        } else if (res.tapIndex === 1) {
          this.clearDraft();
          wx.navigateBack();
        }
      },
    });
  },
});
