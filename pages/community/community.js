// pages/community/community.js
const app = getApp();
const db = wx.cloud.database();
const { getCaseNavCategories } = require('../../utils/categories.js');
const USER_BATCH_CACHE_TTL = 5 * 60 * 1000;
const VALID_COMMUNITY_FILTERS = new Set(['all', '楠竹社区', '和美社区']);

Page({
  data: {
    currentTab: 1, // Default to 'Community'
    leftColPosts: [],
    rightColPosts: [],
    posts: [],
    searchKeyword: '',
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    communityFilter: 'all', // 'all', '楠竹社区', '和美社区'
    caseCategory: 'all', // 案例分类筛选（使用ID）
    caseCategories: [], // 案例分类列表
  },

  onLoad: function (options) {
    this.lastAppliedKeyword = '';
    // 初始化案例分类列表
    const categories = getCaseNavCategories();
    this.setData({
      caseCategories: categories
    });
    
    this.loadPostsOptimized(true);
  },

  onShow: function () {
    // 更新 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }

    const tab = wx.getStorageSync("communityInitialTab");
    const initialFilter = wx.getStorageSync("communityInitialFilter");
    const nextFilter = VALID_COMMUNITY_FILTERS.has(initialFilter) ? initialFilter : '';
    const shouldApplyTab = typeof tab === "number" && tab !== this.data.currentTab;
    const shouldApplyFilter = !!nextFilter && nextFilter !== this.data.communityFilter;

    if (typeof tab === "number") {
      wx.removeStorageSync("communityInitialTab");
    }
    if (initialFilter) {
      wx.removeStorageSync("communityInitialFilter");
    }

    if (shouldApplyTab || shouldApplyFilter) {
      this.setData(
        {
          currentTab: shouldApplyTab ? tab : this.data.currentTab,
          communityFilter: shouldApplyFilter ? nextFilter : this.data.communityFilter,
          posts: [],
          leftColPosts: [],
          rightColPosts: [],
          page: 1,
          hasMore: true,
        },
        () => this.loadPostsOptimized(true),
      );
      return;
    }
  },

  onUnload: function () {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
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

  // 切换社区筛选
  switchCommunityFilter: function (e) {
    const community = e.currentTarget.dataset.community;
    if (community === this.data.communityFilter) return;

    this.setData({
      communityFilter: community,
      posts: [],
      leftColPosts: [],
      rightColPosts: [],
      page: 1,
      hasMore: true
    });
    this.loadPostsOptimized(true);
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
    this.loadPostsOptimized(true);
  },

  applySearchKeyword: function (keyword) {
    const normalized = String(keyword || '').trim();
    if (normalized === this.lastAppliedKeyword) return;

    this.lastAppliedKeyword = normalized;
    this.setData(
      {
        posts: [],
        leftColPosts: [],
        rightColPosts: [],
        page: 1,
        hasMore: true,
      },
      () => this.loadPostsOptimized(true),
    );
  },

  onSearchInput: function (e) {
    const keyword = String((e && e.detail && e.detail.value) || '');
    this.setData({ searchKeyword: keyword });

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.applySearchKeyword(keyword);
    }, 350);
  },

  onSearchConfirm: function (e) {
    const keyword = String((e && e.detail && e.detail.value) || this.data.searchKeyword || '');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.setData({ searchKeyword: keyword }, () => {
      this.applySearchKeyword(keyword);
    });
  },

  onSearchClear: function () {
    if (!this.data.searchKeyword) return;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.setData({ searchKeyword: '' }, () => {
      this.applySearchKeyword('');
    });
  },

  fetchUsersBatch: function (openids) {
    const ids = Array.from(new Set((openids || []).filter(Boolean)));
    if (ids.length === 0) return Promise.resolve({});

    if (!this._userBatchCache) this._userBatchCache = new Map();
    if (!this._userBatchInflight) this._userBatchInflight = new Map();

    const now = Date.now();
    const cachedMap = {};
    const missIds = [];
    ids.forEach((id) => {
      const cached = this._userBatchCache.get(id);
      if (cached && cached.expireAt > now && cached.data) {
        cachedMap[id] = cached.data;
      } else {
        missIds.push(id);
      }
    });

    if (missIds.length === 0) {
      return Promise.resolve(cachedMap);
    }

    const inflightKey = missIds.slice().sort().join(',');
    let inflight = this._userBatchInflight.get(inflightKey);
    if (!inflight) {
      inflight = wx.cloud.callFunction({
        name: 'getUsersBatch',
        data: {
          openids: missIds,
          fieldMode: 'basic'
        }
      }).then((res) => {
        if (res.result && res.result.success && res.result.data) {
          return res.result.data;
        }
        return {};
      }).catch((err) => {
        console.error('getUsersBatch failed:', err);
        return {};
      }).finally(() => {
        this._userBatchInflight.delete(inflightKey);
      });
      this._userBatchInflight.set(inflightKey, inflight);
    }

    return inflight.then((remoteMap) => {
      const expireAt = Date.now() + USER_BATCH_CACHE_TTL;
      Object.keys(remoteMap).forEach((openid) => {
        this._userBatchCache.set(openid, {
          data: remoteMap[openid],
          expireAt
        });
      });
      return Object.assign({}, cachedMap, remoteMap);
    });
  },

  formatPostTag: function (post) {
    const subtypeText = Array.isArray(post.recognizedSubtypes) && post.recognizedSubtypes.length
      ? post.recognizedSubtypes.join('、')
      : post.recognizedSubtype;
    if (post.recognizedCategory && subtypeText) {
      return `${post.recognizedCategory} / ${subtypeText}`;
    }
    return post.categoryName ||
      post.category ||
      (post.type === "case"
        ? "案例"
        : post.type === "issue"
          ? "问题反馈"
          : post.type === "demand"
            ? "改造需求"
            : "日常");
  },

  mapPostsWithUsers: function (rawPosts, batchUserMap) {
    return (rawPosts || []).map((p) => {
      const images = Array.isArray(p.images) ? p.images : [];
      const titleSource = p.title || p.content || "";
      const title = String(titleSource).split("\n")[0].slice(0, 40);
      const userData = (batchUserMap && batchUserMap[p._openid]) || {};
      const userInfo = userData.userInfo || p.userInfo || {};
      const userType = userData.userType || p.userType || "resident";
      const tag = this.formatPostTag(p);

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
        userType,
        likes: (p.stats && p.stats.like) || 0,
      };
    });
  },

  splitColumns: function (posts) {
    const leftColPosts = [];
    const rightColPosts = [];
    (posts || []).forEach((post, index) => {
      if (index % 2 === 0) leftColPosts.push(post);
      else rightColPosts.push(post);
    });
    return { leftColPosts, rightColPosts };
  },

  loadPostsOptimized: function (refresh) {
    if (this.data.loading) return;
    if (!this.data.hasMore && !refresh) return;

    const nextPage = refresh ? 1 : this.data.page + 1;
    const currentTab = this.data.currentTab;
    const requestToken = (this._postsRequestToken || 0) + 1;
    this._postsRequestToken = requestToken;

    this.setData({ loading: true });

    const queryData = {
      collection: "posts",
      page: nextPage,
      pageSize: this.data.pageSize,
      orderBy: "createTime",
      order: "desc",
    };
    const keyword = String(this.data.searchKeyword || "").trim();
    if (keyword) {
      queryData.keyword = keyword;
    }

    if (currentTab === 0) {
      queryData.type = "demand";
    } else if (currentTab === 2) {
      queryData.type = "issue";
      queryData.status = "completed";
      if (this.data.caseCategory !== "all") {
        queryData.category = this.data.caseCategory;
      }
    } else if (this.data.communityFilter !== "all") {
      queryData.community = this.data.communityFilter;
    }

    wx.cloud.callFunction({
      name: "getPublicData",
      data: queryData,
    }).then(async (res) => {
      if (requestToken !== this._postsRequestToken) return;
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || "加载失败");
      }

      const raw = res.result.data || [];
      const authorIds = [...new Set(raw.map((p) => p._openid).filter(Boolean))];
      const batchUserMap = await this.fetchUsersBatch(authorIds);
      if (requestToken !== this._postsRequestToken) return;

      const mapped = this.mapPostsWithUsers(raw, batchUserMap);
      const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
      const hasMore = !!(
        res.result.pagination && res.result.pagination.hasMore
      );
      const { leftColPosts, rightColPosts } = this.splitColumns(posts);
      if (requestToken !== this._postsRequestToken) return;

      this.setData({
        posts,
        leftColPosts,
        rightColPosts,
        page: nextPage,
        hasMore,
        loading: false,
      });
    }).catch((err) => {
      if (requestToken !== this._postsRequestToken) return;
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    });
  },

  loadFollowPostsOptimized: function (refresh, nextPage, requestToken) {
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
          if (requestToken !== this._postsRequestToken) return null;
          this.setData({
            posts: [],
            leftColPosts: [],
            rightColPosts: [],
            page: 1,
            hasMore: false,
            loading: false,
          });
          return null;
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
            ...(this.data.searchKeyword && this.data.searchKeyword.trim()
              ? { keyword: this.data.searchKeyword.trim() }
              : {}),
          },
        });
      })
      .then(async (res) => {
        if (!res) return;
        if (requestToken !== this._postsRequestToken) return;
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        const authorIds = [...new Set(raw.map((p) => p._openid).filter(Boolean))];
        const batchUserMap = await this.fetchUsersBatch(authorIds);
        if (requestToken !== this._postsRequestToken) return;

        const mapped = this.mapPostsWithUsers(raw, batchUserMap);
        const posts = refresh ? mapped : (this.data.posts || []).concat(mapped);
        const hasMore = !!(
          res.result.pagination && res.result.pagination.hasMore
        );
        const { leftColPosts, rightColPosts } = this.splitColumns(posts);
        if (requestToken !== this._postsRequestToken) return;

        this.setData({
          posts,
          leftColPosts,
          rightColPosts,
          page: nextPage,
          hasMore,
          loading: false,
        });
      })
      .catch((err) => {
        if (requestToken !== this._postsRequestToken) return;
        this.setData({ loading: false });
        wx.showToast({ title: err.message || "请先登录", icon: "none" });
      });
  },

  loadPosts: function (refresh) {
    if (this.data.loading) return;
    if (!this.data.hasMore && !refresh) return;

    const nextPage = refresh ? 1 : this.data.page + 1;
    const currentTab = this.data.currentTab;

    this.setData({ loading: true });

    // 构建查询参数
    const queryData = {
      collection: "posts",
      page: nextPage,
      pageSize: this.data.pageSize,
      orderBy: "createTime",
      order: "desc",
    };
    const keyword = String(this.data.searchKeyword || '').trim();
    if (keyword) {
      queryData.keyword = keyword;
    }

    // 案例板块：只显示已完成的问题帖
    if (currentTab === 0) {
      queryData.type = 'demand';
    } else if (currentTab === 2) {
      queryData.type = 'issue';
      queryData.status = 'completed';
      // 添加分类筛选
      if (this.data.caseCategory !== 'all') {
        queryData.category = this.data.caseCategory;
      }
    } else {
      // 社区板块：根据筛选条件添加 type 参数
      if (this.data.communityFilter !== 'all') {
        queryData.community = this.data.communityFilter;
      }
    }

    wx.cloud
      .callFunction({
        name: "getPublicData",
        data: queryData,
      })
      .then(async (res) => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        console.log('📊 云函数返回的帖子数量:', raw.length);
        
        // 提取所有作者的 openid
        const authorIds = [...new Set(raw.map(p => p._openid).filter(Boolean))];
        const batchUserMap = await this.fetchUsersBatch(authorIds);
        
        // 批量查询用户的最新信息
        const userInfoPromises = authorIds.map(openid => 
          Promise.resolve({
            result: {
              success: true,
              data: batchUserMap[openid] || {}
            }
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
            
            const tag = this.formatPostTag(p);
            
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
      .then(async (res) => {
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
            ...(this.data.searchKeyword && this.data.searchKeyword.trim()
              ? { keyword: this.data.searchKeyword.trim() }
              : {}),
          },
        });
      })
      .then(async (res) => {
        if (!res) return;
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.error || "加载失败");
        }

        const raw = res.result.data || [];
        console.log('📊 关注列表返回的帖子数量:', raw.length);
        
        // 提取所有作者的 openid
        const authorIds = [...new Set(raw.map(p => p._openid).filter(Boolean))];
        const batchUserMap = await this.fetchUsersBatch(authorIds);
        
        // 批量查询用户的最新信息
        const userInfoPromises = authorIds.map(openid => 
          Promise.resolve({
            result: {
              success: true,
              data: batchUserMap[openid] || {}
            }
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
            
            const tag = this.formatPostTag(p);
            
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
      () => this.loadPostsOptimized(true),
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
    this.loadPostsOptimized(false);
  }
});
