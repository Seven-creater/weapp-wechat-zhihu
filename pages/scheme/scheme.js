Page({
  data: {
    typeFilters: [
      "无障碍停车位",
      "无障碍卫生间",
      "无障碍坡道",
      "无障碍电梯",
      "无障碍升降台",
    ],
    selectedType: "无障碍停车位",

    showSortFilterPopup: false,
    sortOptions: ["推荐", "最新", "浏览数", "点赞数", "评论数"],
    selectedSort: "推荐",

    schemes: [],
    loading: false,
  },

  onLoad: function () {
    this.loadSchemes();
  },

  loadSchemes: function () {
    this.setData({ loading: true });
    let orderBy = "createTime";
    let order = "desc";
    if (this.data.selectedSort === "浏览数") orderBy = "viewCount";
    if (this.data.selectedSort === "点赞数") orderBy = "stats.like";
    if (this.data.selectedSort === "评论数") orderBy = "stats.comment";

    const category = this.data.selectedType || "";

    wx.cloud
      .callFunction({
        name: "getPublicData",
        data: {
          collection: "solutions",
          page: 1,
          pageSize: 50,
          orderBy,
          order,
          status: "已完成",
          category: category || undefined,
        },
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const list = (res.result.data || []).map((item) => {
          const image =
            item.imageUrl ||
            item.beforeImg ||
            item.coverImage ||
            item.afterImg ||
            "";
          const tags = item.category ? [item.category] : [];
          return {
            postId: item._id,
            image,
            name: item.title || "无障碍案例",
            author: item.status || "方案",
            views: item.viewCount || 0,
            tags,
          };
        });

        this.setData({ schemes: list, loading: false });
      })
      .catch((err) => {
        console.error("加载案例库失败:", err);
        this.setData({ loading: false, schemes: [] });
      });
  },

  onPullDownRefresh: function () {
    this.loadSchemes();
    wx.stopPullDownRefresh();
  },

  selectType: function (e) {
    const type = e.currentTarget.dataset.type;
    if (!type || type === this.data.selectedType) return;
    this.setData({ selectedType: type }, () => this.loadSchemes());
  },

  showSortFilter: function () {
    this.setData({
      showSortFilterPopup: true,
    });
  },

  hideSortFilter: function () {
    this.setData({
      showSortFilterPopup: false,
    });
  },

  selectSort: function (e) {
    const sort = e.currentTarget.dataset.sort;
    this.setData({
      selectedSort: sort,
    });
  },

  confirmSortFilter: function () {
    this.hideSortFilter();
    this.loadSchemes();
  },

  goToDetail: function (e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: "/pages/case-detail/case-detail?postId=" + postId,
    });
  },
});
