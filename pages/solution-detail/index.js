// pages/solution-detail/index.js
const db = wx.cloud.database();
const collectUtil = require("../../utils/collect.js");

Page({
  data: {
    solution: {},
    showModal: false,
    feedbackLetter: "",
    isCollected: false, // 是否已收藏
    collectCount: 0, // 收藏数量
  },

  onLoad: function (options) {
    const solutionId = options.id || options.solutionId;
    if (solutionId) {
      this.loadSolutionDetail(solutionId);
    }
  },

  // 加载解决方案详情
  loadSolutionDetail: function (solutionId) {
    wx.showLoading({
      title: "加载中...",
    });

    db.collection("solutions")
      .doc(solutionId)
      .get()
      .then((res) => {
        const solution = res.data;
        this.setData({ solution });

        // 动态设置页面标题
        wx.setNavigationBarTitle({
          title: solution.title,
        });

        // 更新浏览量
        this.updateViewCount(solutionId);

        // 初始化收藏状态
        collectUtil
          .initCollectStatus(this, "collect_solution", solutionId)
          .then(() => {
            wx.hideLoading();
          })
          .catch(() => {
            wx.hideLoading();
          });
      })
      .catch((err) => {
        console.error("加载解决方案详情失败:", err);
        wx.hideLoading();
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
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

  // 页面卸载时，将最新的收藏状态更新回列表页
  onUnload: function () {
    const pages = getCurrentPages();
    if (pages.length < 2) return;

    const prevPage = pages[pages.length - 2];
    const solutionId = this.data.solution?._id;

    if (!solutionId) return;

    // 检查上一页是否是列表页，并调用更新方法
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
});
