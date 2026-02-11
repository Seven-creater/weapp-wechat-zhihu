// pages/community/community.js
const app = getApp();
const db = wx.cloud.database();
const { getCaseNavCategories } = require('../../utils/categories.js');

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
    postTypeFilter: 'all', // 'all', 'issue', 'daily'
    caseCategory: 'all', // 案例分类筛选（使用ID）
    caseCategories: [], // 案例分类列表
  },

  onLoad: function (options) {
    // 初始化案例分类列表
    const categories = getCaseNavCategories();
    this.setData({
      caseCategories: categories
    });
    
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

  // 切换帖子类型筛选
  switchPostType: function (e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.postTypeFilter) return;

    this.setData({
      postTypeFilter: type,
      posts: [],
      leftColPosts: [],
      rightColPosts: [],
      page: 1,
      hasMore: true
    });
    this.loadPosts(true);
  },

  // 切换案例分类筛选
  switchCaseCategory: function (e) {
    const categoryId = e.currentTarget.dataset.id;
    if (categoryId === this.data.caseCategory) return;

    this.setData({
      caseCategory: categoryId,
      posts: [],
      leftColPosts: [],
      rightColPosts: [],
      page: 1,
      hasMore: true
    });
    this.loadPosts(true);
  },

  loadPosts: function (refresh) {
    if (this.data.loading) return;
    if (!this.data.hasMore && !refresh) return;

    const nextPage = refresh ? 1 : this.data.page + 1;
    const currentTab = this.data.currentTab;

    if (currentTab === 0) {
      this.loadFollowPosts(refresh, nextPage);
      return;
    }

    this.setData({ loading: true });

    // 构建查询参数
    const queryData = {
      collection: "posts",
      page: nextPage,
      pageSize: this.data.pageSize,
      orderBy: "createTime",
      order: "desc",
    };

    // 案例板块：只显示已完成的问题帖
    if (currentTab === 2) {
      queryData.type = 'issue';
      queryData.status = 'completed';
      // 添加分类筛选
      if (this.data.caseCategory !== 'all') {
        queryData.category = this.data.caseCategory;
      }
    } else {
      // 社区板块：根据筛选条件添加 type 参数
      if (this.data.postTypeFilter !== 'all') {
        queryData.type = this.data.postTypeFilter;
      }
    }

    wx.cloud
      .callFunction({
        name: "getPublicData",
        data: queryData,
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        console.log('📊 云函数返回的帖子数量:', raw.length);
        
        // 提取所有作者的 openid
        const authorIds = [...new Set(raw.map(p => p._openid).filter(Boolean))];
        
        // 批量查询用户的最新信息
        const userInfoPromises = authorIds.map(openid => 
          wx.cloud.callFunction({
            name: 'getUserInfo',
            data: { targetId: openid }
          }).then(userRes => {
            if (userRes.result && userRes.result.success && userRes.result.data) {
              return {
                openid: openid,
                userType: userRes.result.data.userType || 'resident',
                userInfo: userRes.result.data.userInfo || {}
              };
            }
            return { openid: openid, userType: 'resident', userInfo: {} };
          }).catch(() => {
            return { openid: openid, userType: 'resident', userInfo: {} };
          })
        );
        
        return Promise.all(userInfoPromises).then(usersData => {
          // 创建用户信息映射
          const userMap = new Map();
          usersData.forEach(user => {
            userMap.set(user.openid, {
              userType: user.userType,
              userInfo: user.userInfo
            });
          });
          
          const mapped = raw.map((p) => {
            const images = Array.isArray(p.images) ? p.images : [];
            const titleSource = p.title || p.content || "";
            const title = String(titleSource).split("\n")[0].slice(0, 40);
            
            // 使用实时查询的用户信息
            const userData = userMap.get(p._openid) || {};
            const userInfo = userData.userInfo || p.userInfo || {};
            const userType = userData.userType || p.userType || 'resident';
            
            // 优先使用 categoryName，其次使用 category，最后根据 type 判断
            const tag = p.categoryName || 
              p.category ||
              (p.type === "case"
                ? "案例"
                : p.type === "issue"
                  ? "问题反馈"
                  : "日常");
            
            return {
              id: p._id,
              title: title || "未命名内容",
              image: images[0] || "/images/24213.jpg",
              hasImage: images.length > 0,
              tag,
              user: {
                id: p._openid,
                _openid: p._openid,
                name: userInfo.nickName || "微信用户",
                avatar: userInfo.avatarUrl || "/images/zhi.png",
              },
              userType: userType,
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
        });
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
        console.log('📊 关注列表返回的帖子数量:', raw.length);
        
        // 提取所有作者的 openid
        const authorIds = [...new Set(raw.map(p => p._openid).filter(Boolean))];
        
        // 批量查询用户的最新信息
        const userInfoPromises = authorIds.map(openid => 
          wx.cloud.callFunction({
            name: 'getUserInfo',
            data: { targetId: openid }
          }).then(userRes => {
            if (userRes.result && userRes.result.success && userRes.result.data) {
              return {
                openid: openid,
                userType: userRes.result.data.userType || 'resident',
                userInfo: userRes.result.data.userInfo || {}
              };
            }
            return { openid: openid, userType: 'resident', userInfo: {} };
          }).catch(() => {
            return { openid: openid, userType: 'resident', userInfo: {} };
          })
        );
        
        return Promise.all(userInfoPromises).then(usersData => {
          // 创建用户信息映射
          const userMap = new Map();
          usersData.forEach(user => {
            userMap.set(user.openid, {
              userType: user.userType,
              userInfo: user.userInfo
            });
          });
          
          const mapped = raw.map((p) => {
            const images = Array.isArray(p.images) ? p.images : [];
            const titleSource = p.title || p.content || "";
            const title = String(titleSource).split("\n")[0].slice(0, 40);
            
            // 使用实时查询的用户信息
            const userData = userMap.get(p._openid) || {};
            const userInfo = userData.userInfo || p.userInfo || {};
            const userType = userData.userType || p.userType || 'resident';
            
            // 优先使用 categoryName，其次使用 category，最后根据 type 判断
            const tag = p.categoryName || 
              p.category ||
              (p.type === "case"
                ? "案例"
                : p.type === "issue"
                  ? "问题反馈"
                  : "日常");
            
            return {
              id: p._id,
              title: title || "未命名内容",
              image: images[0] || "/images/24213.jpg",
              hasImage: images.length > 0,
              tag,
              user: {
                id: p._openid,
                _openid: p._openid,
                name: userInfo.nickName || "微信用户",
                avatar: userInfo.avatarUrl || "/images/zhi.png",
              },
              userType: userType,
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
        });
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
    // 所有帖子都跳转到帖子详情页
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
  }
});
