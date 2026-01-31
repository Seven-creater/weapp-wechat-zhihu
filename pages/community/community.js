// pages/community/community.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    currentTab: 1, // Default to 'Community'
    leftColPosts: [],
    rightColPosts: [],
    posts: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
  },

  onLoad: function (options) {
    this.loadPosts(true);
  },

  onShow: function () {
    // 更新 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }

    const tab = wx.getStorageSync("communityInitialTab");
    if (typeof tab === "number" && tab !== this.data.currentTab) {
      wx.removeStorageSync("communityInitialTab");
      this.setData(
        {
          currentTab: tab,
          posts: [],
          leftColPosts: [],
          rightColPosts: [],
          page: 1,
          hasMore: true,
        },
        () => this.loadPosts(true),
      );
      return;
    }
    if (typeof tab === "number") {
      wx.removeStorageSync("communityInitialTab");
    }
  },

  distributePosts: function (list) {
    const left = [];
    const right = [];
    (list || []).forEach((post, index) => {
      if (index % 2 === 0) left.push(post);
      else right.push(post);
    });
    this.setData({ leftColPosts: left, rightColPosts: right });
  },

  loadPosts: function (refresh) {
    if (this.data.loading) return;
    if (!this.data.hasMore && !refresh) return;

    const nextPage = refresh ? 1 : this.data.page + 1;
    const currentTab = this.data.currentTab;
    const type = currentTab === 2 ? "case" : "";

    if (currentTab === 0) {
      this.loadFollowPosts(refresh, nextPage);
      return;
    }

    this.setData({ loading: true });

    wx.cloud
      .callFunction({
        name: "getPublicData",
        data: {
          collection: "posts",
          page: nextPage,
          pageSize: this.data.pageSize,
          orderBy: "createTime",
          order: "desc",
          type: type || undefined,
        },
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        const mapped = raw.map((p) => {
          const images = Array.isArray(p.images) ? p.images : [];
          const titleSource = p.title || p.content || "";
          const title = String(titleSource).split("\n")[0].slice(0, 40);
          const userInfo = p.userInfo || {};
          const tag =
            p.category ||
            (p.type === "case"
              ? "案例"
              : p.type === "issue"
                ? "随手拍"
                : "社区");
          return {
            id: p._id,
            title: title || "未命名内容",
            image: images[0] || "/images/24213.jpg",
            tag,
            user: {
              _openid: p._openid,
              name: userInfo.nickName || "匿名用户",
              avatar: userInfo.avatarUrl || "/images/zhi.png",
            },
            likes: (p.stats && p.stats.like) || 0,
          };
        });

        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(
          res.result.pagination && res.result.pagination.hasMore
        );

        this.setData({
          posts,
          page: nextPage,
          hasMore,
          loading: false,
        });

        this.distributePosts(posts);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "加载失败", icon: "none" });
      });
  },

  loadFollowPosts: function (refresh, nextPage) {
    this.setData({ loading: true });

    app
      .checkLogin()
      .then(() => {
        // 🔥 修复：直接使用 db 变量，不需要 getDB()
        const openid = app.globalData.openid;
        return db.collection("follows").where({ followerId: openid }).get();
      })
      .then((res) => {
        const targetIds = (res.data || [])
          .map((x) => x.targetId)
          .filter(Boolean);
        if (targetIds.length === 0) {
          this.setData({
            posts: [],
            leftColPosts: [],
            rightColPosts: [],
            page: 1,
            hasMore: false,
            loading: false,
          });
          return;
        }

        return wx.cloud.callFunction({
          name: "getPublicData",
          data: {
            collection: "posts",
            page: nextPage,
            pageSize: this.data.pageSize,
            orderBy: "createTime",
            order: "desc",
            authorOpenids: targetIds,
          },
        });
      })
      .then((res) => {
        if (!res) return;
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        const mapped = raw.map((p) => {
          const images = Array.isArray(p.images) ? p.images : [];
          const titleSource = p.title || p.content || "";
          const title = String(titleSource).split("\n")[0].slice(0, 40);
          const userInfo = p.userInfo || {};
          const tag =
            p.category ||
            (p.type === "case"
              ? "案例"
              : p.type === "issue"
                ? "随手拍"
                : "社区");
          return {
            id: p._id,
            title: title || "未命名内容",
            image: images[0] || "/images/24213.jpg",
            tag,
            user: {
              _openid: p._openid,
              name: userInfo.nickName || "匿名用户",
              avatar: userInfo.avatarUrl || "/images/zhi.png",
            },
            likes: (p.stats && p.stats.like) || 0,
          };
        });

        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(
          res.result.pagination && res.result.pagination.hasMore
        );

        this.setData(
          {
            posts,
            page: nextPage,
            hasMore,
            loading: false,
          },
          () => this.distributePosts(posts),
        );
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "请先登录", icon: "none" });
      });
  },

  onTabTap: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData(
      {
        currentTab: index,
        posts: [],
        leftColPosts: [],
        rightColPosts: [],
        page: 1,
        hasMore: true,
      },
      () => this.loadPosts(true),
    );
  },

  onPostTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${id}`,
    });
  },

  onUserTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({
        url: `/pages/user-profile/index?id=${id}`,
      });
    }
  },

  onLoadMore: function () {
    this.loadPosts(false);
  },
});
