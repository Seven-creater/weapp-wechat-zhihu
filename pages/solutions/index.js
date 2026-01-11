// pages/solutions/index.js
const db = wx.cloud.database();
const _ = db.command;
const collectUtil = require("../../utils/collect.js");

Page({
  data: {
    solutions: [],
    currentCategory: "",
    searchKeyword: "",
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false,
  },

  onLoad: function (options) {
    this.loadSolutions();
  },

  onPullDownRefresh: function () {
    this.setData({
      page: 1,
      solutions: [],
      hasMore: true,
    });
    this.loadSolutions().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 加载解决方案列表（使用云函数获取公开数据）
  loadSolutions: function () {
    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });

    const { page, limit, currentCategory, searchKeyword } = this.data;

    // 调用云函数获取数据（云函数端可绕过权限限制，并自动转换图片URL）
    return wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "solutions",
        page: page,
        pageSize: limit,
        orderBy: "createTime",
        order: "desc",
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          let newSolutions = res.result.data;

          // 字段兼容处理：将 beforeImg 映射到 imageUrl
          newSolutions = newSolutions.map((item) => ({
            ...item,
            // 确保图片字段存在（兼容 beforeImg 和 imageUrl）
            imageUrl: item.imageUrl || item.beforeImg || item.coverImage || "",
            // 确保标题字段存在
            title: item.title || "无障碍方案",
          }));

          const solutions =
            page === 1
              ? newSolutions
              : [...this.data.solutions, ...newSolutions];

          // 更新分页状态
          this.setData({
            solutions: solutions,
            hasMore: res.result.pagination.hasMore,
            loading: false,
          });

          // 同步收藏状态
          this.attachCollectStatus(solutions);

          // 更新浏览量
          if (page === 1) {
            this.updateViewCount(newSolutions);
          }
        } else {
          throw new Error(res.result?.error || "获取数据失败");
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("加载解决方案失败:", err);
        this.setData({ loading: false });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      },
    });
  },

  // 同步收藏状态
  attachCollectStatus: function (solutions) {
    const ids = solutions.map((item) => item._id).filter(Boolean);
    if (ids.length === 0) {
      return;
    }

    db.collection("actions")
      .where(
        _.or([
          { type: "collect_solution", targetId: _.in(ids) },
          { type: "collect_solution", postId: _.in(ids) },
        ])
      )
      .get()
      .then((res) => {
        const collectedIds = new Set(
          res.data.map((item) => item.targetId || item.postId)
        );

        // 更新收藏状态
        const updatedSolutions = this.data.solutions.map((item) => ({
          ...item,
          isCollected: collectedIds.has(item._id),
        }));

        this.setData({ solutions: updatedSolutions });
      })
      .catch((err) => {
        console.error("同步收藏状态失败:", err);
      });
  },

  // 更新浏览量
  updateViewCount: function (solutions) {
    solutions.forEach((solution) => {
      db.collection("solutions")
        .doc(solution._id)
        .update({
          data: {
            viewCount: db.command.inc(1),
          },
        })
        .catch((err) => {
          console.error("更新浏览量失败:", err);
        });
    });
  },

  // 分类筛选
  onFilterChange: function (e) {
    const category = e.currentTarget.dataset.category;
    this.setData({
      currentCategory: category,
      page: 1,
      solutions: [],
      hasMore: true,
    });
    this.loadSolutions();
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword,
    });

    // 防抖搜索
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      if (keyword.trim()) {
        // 有搜索关键词时，使用关键词搜索
        this.keywordSearch(keyword);
      } else {
        // 没有关键词时，恢复普通列表
        this.setData({
          page: 1,
          solutions: [],
          hasMore: true,
        });
        this.loadSolutions();
      }
    }, 500);
  },

  // 关键词搜索（调用云函数）
  keywordSearch: function (keyword) {
    if (!keyword.trim()) return;

    wx.showLoading({
      title: "搜索中...",
      mask: true,
    });

    wx.cloud.callFunction({
      name: "getPublicData",
      data: {
        collection: "solutions",
        keyword: keyword,
        page: 1,
        pageSize: 50,
        orderBy: "createTime",
        order: "desc",
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          let newSolutions = res.result.data;

          // 字段兼容处理：将 beforeImg 映射到 imageUrl
          newSolutions = newSolutions.map((item) => ({
            ...item,
            imageUrl: item.imageUrl || item.beforeImg || item.coverImage || "",
            title: item.title || "无障碍方案",
          }));

          this.setData({
            solutions: newSolutions,
            hasMore: false, // 搜索结果不分页
            loading: false,
            page: 1,
          });

          // 同步收藏状态
          this.attachCollectStatus(newSolutions);

          console.log("关键词搜索完成，找到", newSolutions.length, "条结果");
        } else {
          wx.showToast({
            title: res.result?.error || "搜索失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("搜索失败:", err);
        wx.showToast({
          title: "搜索失败，请重试",
          icon: "none",
        });
      },
    });
  },

  // 加载更多
  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;

    this.setData({
      page: this.data.page + 1,
    });
    this.loadSolutions();
  },

  // 跳转到详情页
  goToDetail: function (e) {
    const solutionId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/solution-detail/index?id=${solutionId}`,
    });
  },

  // 更新方案收藏状态（从详情页回传）
  updateSolutionStatus: function (solutionId, status) {
    const solutions = this.data.solutions;
    const solutionIndex = solutions.findIndex(
      (item) => item._id === solutionId
    );

    if (solutionIndex !== -1) {
      // 更新对应方案的收藏状态
      const updatedSolutions = [...solutions];
      updatedSolutions[solutionIndex] = {
        ...updatedSolutions[solutionIndex],
        isCollected: status.isCollected,
        collectCount: status.collectCount,
      };

      this.setData({
        solutions: updatedSolutions,
      });
    }
  },

  // 收藏方案（列表页直接操作）
  collectSolution: function (e) {
    const solutionId = e.currentTarget.dataset.id;
    const solutions = this.data.solutions;
    const solutionIndex = solutions.findIndex(
      (item) => item._id === solutionId
    );

    if (solutionIndex !== -1) {
      const solution = solutions[solutionIndex];
      const newIsCollected = !solution.isCollected;
      const newCollectCount = newIsCollected
        ? (solution.collectCount || 0) + 1
        : Math.max(0, (solution.collectCount || 0) - 1);

      // 乐观更新UI
      const updatedSolutions = [...solutions];
      updatedSolutions[solutionIndex] = {
        ...updatedSolutions[solutionIndex],
        isCollected: newIsCollected,
        collectCount: newCollectCount,
      };

      this.setData({
        solutions: updatedSolutions,
      });

      const targetData = {
        title: solution.title,
        image: solution.imageUrl || solution.beforeImg || "",
      };

      collectUtil
        .toggleCollect(this, "collect_solution", solutionId, targetData)
        .catch((err) => {
          console.error("收藏操作失败:", err);
          const rollbackSolutions = [...this.data.solutions];
          rollbackSolutions[solutionIndex] = {
            ...rollbackSolutions[solutionIndex],
            isCollected: !newIsCollected,
            collectCount: newIsCollected
              ? Math.max(0, newCollectCount - 1)
              : newCollectCount + 1,
          };
          this.setData({ solutions: rollbackSolutions });
          wx.showToast({ title: "操作失败，请重试", icon: "none" });
        });
    }
  },
});
