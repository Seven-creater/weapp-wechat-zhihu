// pages/solution-detail/index.js
const db = wx.cloud.database();
const collectUtil = require("../../utils/collect.js");

Page({
  data: {
    solution: {},
    showModal: false,
    feedbackLetter: "",
    isCollected: false,
    collectCount: 0,
    isPlaying: false,
  },

  onLoad: function (options) {
    const solutionId = options.id || options.solutionId;
    const collectionName = options.collection || "solutions";

    console.log("接收到的参数:", options);
    console.log("文档ID:", solutionId);
    console.log("数据来源:", collectionName);

    this.setData({
      id: solutionId,
      collectionName: collectionName,
    });

    if (solutionId) {
      this.loadSolutionDetail();
    }
    this.initVoicePlayer();
  },

  onUnload: function () {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
    }

    const pages = getCurrentPages();
    if (pages.length < 2) return;

    const prevPage = pages[pages.length - 2];
    const solutionId = this.data.solution?._id;

    if (!solutionId) return;

    if (
      prevPage.route === "pages/solutions/index" &&
      prevPage.updateSolutionStatus
    ) {
      prevPage.updateSolutionStatus(solutionId, {
        isCollected: this.data.isCollected,
        collectCount: this.data.collectCount,
      });
    }
  },

  toggleVoicePlay: function () {
    const { solution, isPlaying } = this.data;
    const aiAnalysisText = solution.aiAnalysis;

    if (!aiAnalysisText) {
      wx.showToast({
        title: "暂无AI分析内容",
        icon: "none",
      });
      return;
    }

    if (isPlaying) {
      this.innerAudioContext.stop();
      this.setData({ isPlaying: false });
    } else {
      this.playVoice(aiAnalysisText);
    }
  },

  playVoice: function (text) {
    try {
      const plugin = requirePlugin("WeChatSI");

      plugin.textToSpeech({
        lang: "zh_CN",
        tts: true,
        content: text,
        success: (res) => {
          console.log("语音合成成功:", res);
          const audioPath = res.filename;

          this.innerAudioContext.src = audioPath;
          this.innerAudioContext.play();
          this.setData({ isPlaying: true });
        },
        fail: (err) => {
          console.error("语音合成失败:", err);
          wx.showToast({
            title: "语音合成失败",
            icon: "none",
          });
        },
      });
    } catch (err) {
      console.error("初始化语音插件失败:", err);
      wx.showToast({
        title: "语音功能初始化失败",
        icon: "none",
      });
    }
  },

  // 加载解决方案详情
  loadSolutionDetail: function () {
    const { id: documentId, collectionName } = this.data;

    if (!documentId) {
      console.error("文档ID为空");
      wx.showToast({
        title: "参数错误",
        icon: "none",
      });
      return;
    }

    console.log("开始调用云函数查询:", collectionName, "文档ID:", documentId);

    wx.showLoading({
      title: "加载中...",
    });

    // 调用云函数获取详情（云函数会自动转换图片URL）
    wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: collectionName,
        docId: documentId,
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          let data = res.result.data;

          if (!data) {
            wx.showModal({
              title: "提示",
              content: "该内容不存在或已被删除",
              showCancel: false,
              confirmText: "返回",
              success: () => {
                wx.navigateBack();
              },
            });
            return;
          }

          // 如果是 issues 集合(随手拍)，需要进行数据适配
          if (collectionName === "issues") {
            // 适配结构，防止页面报错
            data.title = "路障反馈详情";
            data.aiAnalysis =
              data.aiSolution || data.aiAnalysis || data.description;
            data.beforeImg = data.imageUrl || data.images?.[0] || "";
            data.afterImg = ""; // issues 集合没有 afterImg
            data.status = data.status || "已完成";
            data.address = data.address || "未知位置";

            console.log("issues数据适配完成:", data);
          }

          // 🟢 关键修复：兼容不同集合的字段名
          // 将所有可能的描述字段统一映射到 description
          data.description =
            data.description || data.title || data.content || "";

          // 确保 AI 分析也有值
          data.aiAnalysis =
            data.aiAnalysis || data.aiSolution || "AI 正在分析中...";

          // 🟢 调试日志
          console.log("详情页原始数据:", JSON.stringify(data, null, 2));
          console.log("description 最终值:", data.description);

          // 动态设置页面标题
          wx.setNavigationBarTitle({
            title: data.title || "详情",
          });

          this.setData({ solution: data });

          // 初始化收藏状态
          collectUtil
            .initCollectStatus(this, "collect_" + collectionName, documentId)
            .catch(() => {
              // 初始化失败不影响主要功能
            });
        } else {
          throw new Error(res.result?.error || "获取数据失败");
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("加载详情失败:", err);

        // 处理文档不存在的情况
        if (
          err.errMsg &&
          (err.errMsg.includes("cannot find document") ||
            err.errMsg.includes("document not found"))
        ) {
          wx.showModal({
            title: "提示",
            content: "该内容不存在或已被删除",
            showCancel: false,
            confirmText: "返回",
            success: () => {
              wx.navigateBack();
            },
          });
        } else {
          wx.showToast({
            title: "加载失败",
            icon: "none",
          });
        }
      },
    });
  },

  // 更新浏览量
  updateViewCount: function (solutionId) {
    db.collection("solutions")
      .doc(solutionId)
      .update({
        data: {
          viewCount: db.command.inc(1),
        },
      });
  },

  // 预览图片
  previewImage: function (e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      urls: [src],
    });
  },

  // 复制方案文本
  copySolutionText: function () {
    const { solution } = this.data;
    const textToCopy = `【${solution.title}】\n\nAI诊断报告：\n${solution.aiAnalysis}`;

    wx.setClipboardData({
      data: textToCopy,
      success: () => {
        wx.showToast({
          title: "复制成功",
          icon: "success",
        });
      },
      fail: () => {
        wx.showToast({
          title: "复制失败",
          icon: "none",
        });
      },
    });
  },

  // 生成致书记的一封信
  generateFeedbackLetter: function () {
    const { solution } = this.data;
    const currentDate = new Date().toLocaleDateString("zh-CN");
    const currentTime = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // 格式化AI建议，提取关键整改措施
    const aiAnalysis = solution.aiAnalysis || "";
    const keySuggestions = this.extractKeySuggestions(aiAnalysis);

    const letter = `尊敬的领导：

您好！我是热心市民。

我于 ${currentDate} ${currentTime} 在 ${solution.location || "现场"} 发现 ${
      solution.title
    }。

为保障残障人士出行安全，建议参考以下整改方案：
${keySuggestions}

${aiAnalysis}

此问题关系到广大残障人士的出行权益，希望相关部门能够重视并尽快解决。

盼复，谢谢！

反馈人：无障碍随手拍用户
${currentDate}`;

    // 显示模态框，提供复制功能
    wx.showModal({
      title: "致书记的一封信",
      content: letter,
      showCancel: true,
      cancelText: "关闭",
      confirmText: "一键复制",
      success: (res) => {
        if (res.confirm) {
          // 用户点击一键复制
          wx.setClipboardData({
            data: letter,
            success: () => {
              wx.showToast({
                title: "复制成功",
                icon: "success",
              });
            },
            fail: () => {
              wx.showToast({
                title: "复制失败",
                icon: "none",
              });
            },
          });
        }
      },
    });
  },

  // 提取关键整改措施
  extractKeySuggestions: function (aiAnalysis) {
    if (!aiAnalysis) return "暂无具体整改建议";

    // 尝试提取编号列表（1. 2. 3. 等）
    const numberedList = aiAnalysis.match(/\d+\.\s*[^\n]+/g);
    if (numberedList && numberedList.length > 0) {
      return numberedList.join("\n");
    }

    // 尝试提取建议关键词
    const suggestions = aiAnalysis
      .split(/[。！？；]/)
      .filter(
        (line) =>
          line.includes("建议") ||
          line.includes("应该") ||
          line.includes("需要") ||
          line.includes("可以")
      );

    if (suggestions.length > 0) {
      return suggestions.slice(0, 3).join("\n");
    }

    return (
      aiAnalysis.substring(0, 200) + (aiAnalysis.length > 200 ? "..." : "")
    );
  },

  // 隐藏模态框
  hideModal: function () {
    this.setData({
      showModal: false,
    });
  },

  // 复制反馈函文本
  copyLetterText: function () {
    wx.setClipboardData({
      data: this.data.feedbackLetter,
      success: () => {
        wx.showToast({
          title: "复制成功",
          icon: "success",
        });
        this.hideModal();
      },
      fail: () => {
        wx.showToast({
          title: "复制失败",
          icon: "none",
        });
      },
    });
  },

  // 收藏/取消收藏解决方案
  toggleCollect: function () {
    const solutionId = this.data.solution._id;
    if (!solutionId) return;

    const targetData = {
      title: this.data.solution.title,
      image: this.data.solution.imageUrl || "",
    };

    collectUtil
      .toggleCollect(this, "collect_solution", solutionId, targetData)
      .then(() => {
        // 收藏操作成功，不需要额外提示
      })
      .catch((err) => {
        console.error("收藏操作失败:", err);
        // 操作失败时回滚UI状态
        this.setData({
          isCollected: !this.data.isCollected,
          collectCount: this.data.isCollected
            ? this.data.collectCount - 1
            : this.data.collectCount + 1,
        });
        wx.showToast({
          title: "操作失败，请重试",
          icon: "none",
        });
      });
  },

});
