// pages/solutions/index.js
const db = wx.cloud.database();

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

  // 加载解决方案列表
  loadSolutions: function () {
    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });

    const { page, limit, currentCategory, searchKeyword } = this.data;
    const skip = (page - 1) * limit;

    // 构建查询条件
    let query = db.collection("solutions");

    if (currentCategory) {
      query = query.where({
        category: currentCategory,
      });
    }

    if (searchKeyword) {
      query = query.where({
        title: db.RegExp({
          regexp: searchKeyword,
          options: "i",
        }),
      });
    }

    return query
      .orderBy("createTime", "desc")
      .skip(skip)
      .limit(limit)
      .get()
      .then((res) => {
        const newSolutions = res.data;
        const solutions =
          page === 1 ? newSolutions : [...this.data.solutions, ...newSolutions];

        this.setData({
          solutions,
          hasMore: newSolutions.length === limit,
          loading: false,
        });

        // 更新浏览量
        this.updateViewCount(newSolutions);
      })
      .catch((err) => {
        console.error("加载解决方案失败:", err);
        this.setData({ loading: false });
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
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
      this.setData({
        page: 1,
        solutions: [],
        hasMore: true,
      });
      this.loadSolutions();
    }, 500);
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

      // 跳转到详情页进行完整的收藏操作
      wx.navigateTo({
        url: `/pages/solution-detail/index?id=${solutionId}`,
      });
    }
  },
});
