const mapService = require('../../utils/map.js');
const config = require('../../config/index.js');

const DEFAULT_CENTER = (config && config.defaultLocation) || {
  latitude: 28.2282,
  longitude: 112.9388
};

const BASE_FETCH_RADIUS_M = 10000;
const BASE_FETCH_PAGE_SIZE = 200;
const BASE_FETCH_MAX_PAGES = 3;
const BASE_CENTER_SHIFT_THRESHOLD_M = 500;

const ROUTE_FETCH_EXTRA_RADIUS_M = 1200;
const ROUTE_FETCH_PAGE_SIZE = 300;
const ROUTE_FETCH_MAX_PAGES = 3;
const ROUTE_HIT_THRESHOLD_M = 80;

const SEARCH_DEBOUNCE_MS = 260;
const REGION_REFRESH_DEBOUNCE_MS = 350;
const COMMUNITY_POST_PAGE_SIZE = 20;
const COMMUNITY_SHEET_COLLAPSED_BASE = 156;
const COMMUNITY_OPTIONS = [
  {
    id: 'nanzhu',
    title: '楠竹社区',
    address: '查询楠竹社区障碍信息',
    center: { latitude: 28.06862, longitude: 113.00689 }
  },
  {
    id: 'hemei',
    title: '和美社区',
    address: '查询和美社区障碍信息',
    center: { latitude: 28.0678, longitude: 113.0082 }
  }
];

Page({
  data: {
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    scale: 14,
    markers: [],
    polyline: [],

    loadingObstacles: false,
    routeLoading: false,
    routeActive: false,
    routeSummary: '',
    routeObstacles: [],

    searchVisible: false,
    searchKeyword: '',
    searchResults: [],
    searchLoading: false,
    mapQuotaExceeded: false,

    destination: null,
    destinationLabel: '',
    selectedCommunity: '',
    communitySummary: {},
    communitySummaryVisible: false,
    communitySummaryLoading: false,
    communitySheetExpanded: false,
    communitySheetDragging: false,
    communitySheetHeight: COMMUNITY_SHEET_COLLAPSED_BASE,
    communityPostRows: [],
    communityPostPagination: { page: 1, pageSize: COMMUNITY_POST_PAGE_SIZE, hasMore: false },
    communityPostLoadingMore: false,
    hasLocationPermission: true,

    topInset: 20,
    safeBottom: 0
  },

  onLoad() {
    this.baseObstaclePosts = [];
    this.routeObstaclePosts = [];
    this.activeRoutePoints = [];
    this.markerPostIdMap = Object.create(null);

    this.baseObstacleInflight = null;
    this.routePlanInflight = null;
    this.lastBaseCenter = null;
    this.lastRouteFetchSignature = '';

    this.searchTimer = null;
    this.regionRefreshTimer = null;
    this.searchRequestToken = 0;
    this.lastQuotaTipAt = 0;
    this.communitySheetCollapsedHeight = COMMUNITY_SHEET_COLLAPSED_BASE;
    this.communitySheetExpandedHeight = 520;
    this.communitySheetDrag = null;

    this.currentLocation = null;
    this.mapCtx = null;

    this.initSafeArea();
    this.requestUserLocation({ silent: true }).finally(() => {
      this.loadBaseObstaclesByCenter(
        {
          latitude: this.data.latitude,
          longitude: this.data.longitude
        },
        { force: true }
      );
    });
  },

  onReady() {
    this.mapCtx = wx.createMapContext('mainMap', this);
  },

  onShow() {
    this.syncTabSelection();
  },

  onHide() {
    this.clearTimers();
  },

  onUnload() {
    this.clearTimers();
  },

  onPullDownRefresh() {
    if (this.data.selectedCommunity) {
      this.loadCommunitySummary(this.data.selectedCommunity, { keepViewport: true }).finally(() => {
        wx.stopPullDownRefresh();
      });
      return;
    }
    Promise.resolve()
      .then(() => this.requestUserLocation({ silent: true }))
      .then(() =>
        this.loadBaseObstaclesByCenter(
          {
            latitude: this.data.latitude,
            longitude: this.data.longitude
          },
          { force: true }
        )
      )
      .finally(() => {
        wx.stopPullDownRefresh();
      });
  },

  initSafeArea() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const topInset = Number(info.statusBarHeight) || 20;
      const safeBottom = Math.max(0, (info.safeAreaInsets && info.safeAreaInsets.bottom) || 0);
      const windowHeight = Number(info.windowHeight) || 760;
      this.communitySheetCollapsedHeight = COMMUNITY_SHEET_COLLAPSED_BASE + safeBottom;
      this.communitySheetExpandedHeight = Math.round(windowHeight * 0.7);
      this.setData({
        topInset,
        safeBottom,
        communitySheetHeight: this.communitySheetCollapsedHeight
      });
    } catch (err) {
      this.communitySheetCollapsedHeight = COMMUNITY_SHEET_COLLAPSED_BASE;
      this.communitySheetExpandedHeight = 520;
      this.setData({
        topInset: 20,
        safeBottom: 0,
        communitySheetHeight: this.communitySheetCollapsedHeight
      });
    }
  },

  clearTimers() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    if (this.regionRefreshTimer) {
      clearTimeout(this.regionRefreshTimer);
      this.regionRefreshTimer = null;
    }
  },

  syncTabSelection() {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (!tabBar || typeof tabBar.setData !== 'function') return;
    tabBar.setData({ selected: 0 });
  },

  requestUserLocation({ silent = false } = {}) {
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const latitude = Number(res.latitude);
          const longitude = Number(res.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            resolve(null);
            return;
          }
          this.currentLocation = { latitude, longitude };
          this.setData({
            latitude,
            longitude,
            hasLocationPermission: true
          });
          resolve(this.currentLocation);
        },
        fail: () => {
          this.currentLocation = null;
          this.setData({ hasLocationPermission: false });
          if (!silent) {
            wx.showToast({
              title: '未授权定位，可手动选目的地',
              icon: 'none'
            });
          }
          resolve(null);
        }
      });
    });
  },

  onCenterTap() {
    if (this.data.selectedCommunity && this.data.communitySummary && this.data.communitySummary.center) {
      this.includeCommunityPoints(this.data.communitySummary.points || [], this.data.communitySummary.center);
      return;
    }
    if (!this.currentLocation) {
      this.requestUserLocation();
      return;
    }
    const center = {
      latitude: this.currentLocation.latitude,
      longitude: this.currentLocation.longitude
    };
    this.setData({
      latitude: center.latitude,
      longitude: center.longitude,
      scale: 15
    });
    this.loadBaseObstaclesByCenter(center, { force: true, silent: true });
  },

  onRegionChange(e) {
    if (!e || e.type !== 'end') return;
    if (this.data.selectedCommunity) return;
    if (this.regionRefreshTimer) {
      clearTimeout(this.regionRefreshTimer);
    }
    this.regionRefreshTimer = setTimeout(() => {
      this.reloadObstaclesByMapCenter();
    }, REGION_REFRESH_DEBOUNCE_MS);
  },

  reloadObstaclesByMapCenter() {
    if (!this.mapCtx || this.baseObstacleInflight) return;
    this.mapCtx.getCenterLocation({
      success: (res) => {
        const center = {
          latitude: Number(res.latitude),
          longitude: Number(res.longitude)
        };
        if (!this.isValidCoord(center.latitude, center.longitude)) return;
        this.loadBaseObstaclesByCenter(center, { silent: true });
      }
    });
  },

  loadBaseObstaclesByCenter(center, { force = false, silent = false } = {}) {
    if (!center || !this.isValidCoord(center.latitude, center.longitude)) {
      return Promise.resolve();
    }

    if (!force && this.lastBaseCenter) {
      const centerShift = this.haversineDistance(this.lastBaseCenter, center);
      if (centerShift < BASE_CENTER_SHIFT_THRESHOLD_M) {
        return Promise.resolve();
      }
    }

    if (this.baseObstacleInflight) {
      return this.baseObstacleInflight;
    }

    if (!silent) {
      this.setData({ loadingObstacles: true });
    }

    const request = this.fetchIssuePostsNear(center, BASE_FETCH_RADIUS_M, BASE_FETCH_PAGE_SIZE, BASE_FETCH_MAX_PAGES)
      .then((rows) => {
        this.baseObstaclePosts = rows;
        this.lastBaseCenter = center;
        const markers = this.buildDisplayMarkers(this.baseObstaclePosts, this.routeObstaclePosts);
        this.setData({
          markers,
          loadingObstacles: false
        });
      })
      .catch((err) => {
        console.error('[index] loadBaseObstaclesByCenter failed:', err);
        this.setData({ loadingObstacles: false });
        wx.showToast({
          title: '障碍点加载失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.baseObstacleInflight = null;
      });

    this.baseObstacleInflight = request;
    return request;
  },

  fetchIssuePostsNear(center, maxDistance, pageSize, maxPages) {
    const allRows = [];
    const safePageSize = Math.max(1, Number(pageSize) || BASE_FETCH_PAGE_SIZE);
    const safeMaxPages = Math.max(1, Number(maxPages) || 1);
    const safeRadius = Math.max(100, Number(maxDistance) || BASE_FETCH_RADIUS_M);

    const loop = (page) => {
      if (page > safeMaxPages) {
        return Promise.resolve();
      }
      return wx.cloud.callFunction({
        name: 'getPublicData',
        data: {
          collection: 'posts',
          type: 'issue',
          fieldMode: 'list',
          page,
          pageSize: safePageSize,
          orderBy: 'createTime',
          order: 'desc',
          near: {
            latitude: center.latitude,
            longitude: center.longitude,
            maxDistance: safeRadius
          }
        }
      }).then((res) => {
        const result = res && res.result;
        if (!result || !result.success) {
          throw new Error((result && result.error) || 'query failed');
        }

        const normalized = (result.data || [])
          .map((item) => this.normalizeIssuePost(item))
          .filter(Boolean);
        allRows.push(...normalized);

        if (result.pagination && result.pagination.hasMore) {
          return loop(page + 1);
        }
        return null;
      });
    };

    return loop(1).then(() => {
      const deduped = [];
      const seen = new Set();
      for (const row of allRows) {
        if (!row || seen.has(row._id)) continue;
        seen.add(row._id);
        deduped.push(row);
      }
      return deduped;
    });
  },

  normalizeIssuePost(raw) {
    if (!raw || !raw._id) return null;
    const location = this.extractPostLocation(raw);
    if (!location) return null;
    return {
      ...raw,
      _id: String(raw._id),
      _mapLocation: location
    };
  },

  extractPostLocation(post) {
    if (!post || !post.location) return null;
    const location = post.location;

    if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
      const longitude = Number(location.coordinates[0]);
      const latitude = Number(location.coordinates[1]);
      if (this.isValidCoord(latitude, longitude)) {
        return { latitude, longitude };
      }
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (this.isValidCoord(latitude, longitude)) {
      return { latitude, longitude };
    }

    return null;
  },

  isValidCoord(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
    return true;
  },

  buildDisplayMarkers(basePosts, routePosts) {
    const merged = new Map();
    const routeDistanceMap = new Map();

    (basePosts || []).forEach((item) => {
      merged.set(item._id, item);
    });

    (routePosts || []).forEach((item) => {
      merged.set(item._id, item);
      if (Number.isFinite(item._distanceToRoute)) {
        routeDistanceMap.set(item._id, item._distanceToRoute);
      }
    });

    const markerPostIdMap = Object.create(null);
    const markers = [];
    let markerId = 1;

    merged.forEach((item, postId) => {
      const loc = item._mapLocation || this.extractPostLocation(item);
      if (!loc) return;

      const isRouteHit = routeDistanceMap.has(postId);
      const marker = {
        id: markerId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        iconPath: '/images/marker_alert.svg',
        width: isRouteHit ? 34 : 28,
        height: isRouteHit ? 34 : 28,
        callout: {
          content: this.buildMarkerLabel(item, isRouteHit, routeDistanceMap.get(postId)),
          color: '#111827',
          fontSize: 11,
          borderRadius: 8,
          padding: 6,
          bgColor: isRouteHit ? '#fee2e2' : '#ffffff',
          display: 'BYCLICK'
        }
      };
      markers.push(marker);
      markerPostIdMap[markerId] = postId;
      markerId += 1;
    });

    this.markerPostIdMap = markerPostIdMap;
    return markers;
  },

  buildMarkerLabel(post, isRouteHit, routeDistance) {
    const title = this.trimText(post.title || post.content || '障碍点', 14);
    if (!isRouteHit || !Number.isFinite(routeDistance)) {
      return title;
    }
    return `沿线 ${Math.round(routeDistance)}m: ${title}`;
  },

  trimText(text, maxLen) {
    const value = String(text || '').trim();
    if (!value) return '障碍点';
    if (value.length <= maxLen) return value;
    return `${value.slice(0, maxLen)}...`;
  },

  handleMarkerTap(e) {
    const markerId = Number((e && e.detail && e.detail.markerId) || (e && e.markerId));
    if (!Number.isFinite(markerId)) return;
    const postId = this.markerPostIdMap[markerId];
    if (!postId) return;
    this.openPostDetail(postId);
  },

  openPostDetail(postId) {
    if (!postId) return;
    wx.navigateTo({
      url: `/pages/post-detail/index?id=${encodeURIComponent(postId)}`
    });
  },

  onSearchTap() {
    this.setData({
      searchVisible: true,
      searchKeyword: '',
      searchResults: COMMUNITY_OPTIONS,
      searchLoading: false
    });
  },

  onSearchClose() {
    this.setData({
      searchVisible: false,
      searchKeyword: '',
      searchResults: [],
      searchLoading: false
    });
  },

  onSearchInput(e) {
    const keyword = String((e && e.detail && e.detail.value) || '').trim();
    this.setData({ searchKeyword: keyword });

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }

    if (!keyword) {
      this.setData({
        searchResults: COMMUNITY_OPTIONS,
        searchLoading: false
      });
      return;
    }

    this.searchTimer = setTimeout(() => {
      this.queryCommunitySuggestion(keyword);
    }, SEARCH_DEBOUNCE_MS);
  },

  queryCommunitySuggestion(keyword) {
    const requestToken = ++this.searchRequestToken;
    this.setData({ searchLoading: true });
    return Promise.resolve(this.filterCommunityOptions(keyword))
      .then((rows) => {
        if (requestToken !== this.searchRequestToken) return;
        this.setData({
          searchResults: rows,
          searchLoading: false
        });
      });
  },

  filterCommunityOptions(keyword) {
    const value = String(keyword || '').trim();
    if (!value) return COMMUNITY_OPTIONS;
    return COMMUNITY_OPTIONS.filter((item) => (
      item.title.indexOf(value) !== -1 ||
      item.address.indexOf(value) !== -1
    ));
  },

  onSearchSelect(e) {
    const index = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
    if (!Number.isFinite(index) || index < 0) return;

    const selected = this.data.searchResults[index];
    if (!selected) return;

    this.selectCommunity(selected.title);
  },

  selectCommunity(community) {
    this.setData({
      destination: null,
      destinationLabel: community,
      selectedCommunity: community,
      communitySheetExpanded: false,
      communitySheetHeight: this.communitySheetCollapsedHeight,
      communityPostRows: [],
      communityPostPagination: { page: 1, pageSize: COMMUNITY_POST_PAGE_SIZE, hasMore: false },
      communityPostLoadingMore: false,
      polyline: [],
      routeActive: false,
      routeSummary: '',
      routeObstacles: [],
      searchVisible: false,
      searchKeyword: '',
      searchResults: [],
      searchLoading: false
    });

    this.loadCommunitySummary(community);
  },

  onManualPickTap() {
    wx.chooseLocation({
      success: (res) => {
        const latitude = Number(res && res.latitude);
        const longitude = Number(res && res.longitude);
        if (!this.isValidCoord(latitude, longitude)) {
          wx.showToast({
            title: '选点无效，请重试',
            icon: 'none'
          });
          return;
        }

        const label = String((res && (res.name || res.address)) || '目的地').trim();
        this.setData({
          destination: { latitude, longitude },
          destinationLabel: label || '目的地',
          latitude,
          longitude,
          scale: 15,
          searchVisible: false,
          searchKeyword: '',
          searchResults: [],
          searchLoading: false
        });
        this.planWalkingRoute();
      },
      fail: () => {}
    });
  },

  loadCommunitySummary(community, { keepViewport = false } = {}) {
    const matched = COMMUNITY_OPTIONS.find((item) => item.title === community);
    if (!matched) {
      wx.showToast({ title: '暂无匹配社区', icon: 'none' });
      return Promise.resolve();
    }

    this.setData({
      communitySummaryLoading: true,
      communitySummaryVisible: true,
      communityPostLoadingMore: false
    });

    return wx.cloud.callFunction({
      name: 'getCommunityObstacleSummary',
      data: {
        community,
        includePostRows: true,
        postPage: 1,
        postPageSize: COMMUNITY_POST_PAGE_SIZE
      }
    }).then((res) => {
      const result = res && res.result;
      if (!result || !result.success) {
        throw new Error((result && result.error) || '社区障碍信息加载失败');
      }

      const summary = this.normalizeCommunitySummary(result, matched.center);
      this.baseObstaclePosts = summary.points.map((point) => this.normalizeCommunityPointAsPost(point)).filter(Boolean);
      this.routeObstaclePosts = [];
      const markers = this.buildCommunityMarkers(summary.points);
      this.setData({
        communitySummary: summary,
        communitySummaryLoading: false,
        communitySummaryVisible: true,
        communityPostRows: summary.postRows,
        communityPostPagination: summary.postPagination,
        markers,
        latitude: keepViewport ? this.data.latitude : summary.center.latitude,
        longitude: keepViewport ? this.data.longitude : summary.center.longitude,
        scale: summary.points.length > 1 ? 15 : 16
      });

      if (!keepViewport) {
        this.includeCommunityPoints(summary.points, summary.center);
      }
    }).catch((err) => {
      console.error('[index] loadCommunitySummary failed:', err);
      this.setData({
        communitySummaryLoading: false,
        communitySummaryVisible: false,
        communitySummary: {},
        communityPostRows: [],
        communityPostPagination: { page: 1, pageSize: COMMUNITY_POST_PAGE_SIZE, hasMore: false }
      });
      wx.showToast({
        title: err && err.message ? err.message : '社区障碍信息加载失败',
        icon: 'none'
      });
    });
  },

  normalizeCommunitySummary(result, fallbackCenter) {
    const center = result.center || fallbackCenter;
    const safeCenter = this.isValidCoord(Number(center.latitude), Number(center.longitude))
      ? { latitude: Number(center.latitude), longitude: Number(center.longitude) }
      : fallbackCenter;
    const points = (Array.isArray(result.points) ? result.points : [])
      .map((point) => {
        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (!this.isValidCoord(latitude, longitude)) return null;
        return {
          postId: String(point.postId || ''),
          latitude,
          longitude,
          title: this.trimText(point.title || '障碍信息', 24)
        };
      })
      .filter(Boolean);
    return {
      community: result.community,
      total: Number(result.total) || 0,
      updatedAt: result.updatedAt || '暂无更新',
      center: safeCenter,
      points,
      statusCounts: result.statusCounts || {},
      categoryCounts: result.categoryCounts || {},
      postRows: this.normalizeCommunityPostRows(result.postRows),
      postPagination: {
        page: Number(result.postPagination && result.postPagination.page) || 1,
        pageSize: Number(result.postPagination && result.postPagination.pageSize) || COMMUNITY_POST_PAGE_SIZE,
        hasMore: !!(result.postPagination && result.postPagination.hasMore)
      }
    };
  },

  normalizeCommunityPostRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        postId: String(row.postId || ''),
        title: this.trimText(row.title || '障碍信息', 42),
        tag: this.trimText(row.tag || row.recognizedSubtype || row.recognizedCategory || '未分类', 28),
        status: String(row.status || 'other'),
        statusText: String(row.statusText || '其他')
      }))
      .filter((row) => row.postId);
  },

  normalizeCommunityPointAsPost(point) {
    if (!point || !point.postId) return null;
    return {
      _id: point.postId,
      title: point.title,
      _mapLocation: {
        latitude: point.latitude,
        longitude: point.longitude
      }
    };
  },

  buildCommunityMarkers(points) {
    const markerPostIdMap = Object.create(null);
    const markers = (points || []).map((point, index) => {
      const markerId = index + 1;
      markerPostIdMap[markerId] = point.postId;
      return {
        id: markerId,
        latitude: point.latitude,
        longitude: point.longitude,
        iconPath: '/images/marker_alert.svg',
        width: 30,
        height: 30,
        callout: {
          content: point.title || '障碍信息',
          color: '#111827',
          fontSize: 11,
          borderRadius: 8,
          padding: 6,
          bgColor: '#ffffff',
          display: 'BYCLICK'
        }
      };
    });
    this.markerPostIdMap = markerPostIdMap;
    return markers;
  },

  includeCommunityPoints(points, fallbackCenter) {
    if (!this.mapCtx) return;
    const includePoints = (points || [])
      .filter((point) => this.isValidCoord(point.latitude, point.longitude))
      .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

    if (includePoints.length > 0) {
      this.mapCtx.includePoints({
        points: includePoints,
        padding: [110, 48, 230, 48]
      });
      return;
    }

    if (fallbackCenter && this.isValidCoord(fallbackCenter.latitude, fallbackCenter.longitude)) {
      this.setData({
        latitude: fallbackCenter.latitude,
        longitude: fallbackCenter.longitude,
        scale: 15
      });
    }
  },

  onCommunitySheetTouchStart(e) {
    const touch = e && e.touches && e.touches[0];
    if (!touch || !this.data.communitySummaryVisible) return;
    this.communitySheetDrag = {
      startY: Number(touch.clientY),
      startHeight: Number(this.data.communitySheetHeight) || this.communitySheetCollapsedHeight
    };
    this.lastCommunitySheetHeight = this.communitySheetDrag.startHeight;
    this.setData({ communitySheetDragging: true });
  },

  onCommunitySheetTouchMove(e) {
    const touch = e && e.touches && e.touches[0];
    if (!touch || !this.communitySheetDrag) return;

    const delta = this.communitySheetDrag.startY - Number(touch.clientY);
    const nextHeight = this.clampCommunitySheetHeight(this.communitySheetDrag.startHeight + delta);
    if (Math.abs(nextHeight - this.lastCommunitySheetHeight) < 4) return;
    this.lastCommunitySheetHeight = nextHeight;
    this.setData({ communitySheetHeight: nextHeight });
  },

  onCommunitySheetTouchEnd() {
    if (!this.communitySheetDrag) return;
    this.communitySheetDrag = null;
    const mid = (this.communitySheetCollapsedHeight + this.communitySheetExpandedHeight) / 2;
    this.setCommunitySheetExpanded(Number(this.data.communitySheetHeight) >= mid);
  },

  setCommunitySheetExpanded(expanded) {
    this.setData({
      communitySheetExpanded: !!expanded,
      communitySheetDragging: false,
      communitySheetHeight: expanded ? this.communitySheetExpandedHeight : this.communitySheetCollapsedHeight
    });
  },

  clampCommunitySheetHeight(value) {
    const min = this.communitySheetCollapsedHeight || COMMUNITY_SHEET_COLLAPSED_BASE;
    const max = this.communitySheetExpandedHeight || 520;
    return Math.min(max, Math.max(min, Number(value) || min));
  },

  onCommunityPostListLower() {
    this.loadMoreCommunityPosts();
  },

  loadMoreCommunityPosts() {
    const community = this.data.communitySummary && this.data.communitySummary.community;
    const pagination = this.data.communityPostPagination || {};
    if (!community || this.data.communityPostLoadingMore || !pagination.hasMore) {
      return Promise.resolve();
    }

    const nextPage = (Number(pagination.page) || 1) + 1;
    const pageSize = Number(pagination.pageSize) || COMMUNITY_POST_PAGE_SIZE;
    this.setData({ communityPostLoadingMore: true });

    return wx.cloud.callFunction({
      name: 'getCommunityObstacleSummary',
      data: {
        community,
        includePostRows: true,
        postRowsOnly: true,
        postPage: nextPage,
        postPageSize: pageSize
      }
    }).then((res) => {
      const result = res && res.result;
      if (!result || !result.success) {
        throw new Error((result && result.error) || '帖子加载失败');
      }

      const nextRows = this.normalizeCommunityPostRows(result.postRows);
      const existing = this.data.communityPostRows || [];
      const seen = new Set(existing.map((row) => row.postId));
      const merged = existing.concat(nextRows.filter((row) => !seen.has(row.postId)));
      this.setData({
        communityPostRows: merged,
        communityPostPagination: {
          page: Number(result.postPagination && result.postPagination.page) || nextPage,
          pageSize: Number(result.postPagination && result.postPagination.pageSize) || pageSize,
          hasMore: !!(result.postPagination && result.postPagination.hasMore)
        },
        communityPostLoadingMore: false
      });
    }).catch((err) => {
      console.error('[index] loadMoreCommunityPosts failed:', err);
      this.setData({ communityPostLoadingMore: false });
      wx.showToast({
        title: err && err.message ? err.message : '帖子加载失败',
        icon: 'none'
      });
    });
  },

  onCommunityPostTap(e) {
    const postId = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.postId;
    if (!postId) return;
    this.openPostDetail(postId);
  },

  onCommunityDetailTap() {
    const community = this.data.communitySummary && this.data.communitySummary.community;
    if (!community) return;
    wx.setStorageSync('communityInitialTab', 1);
    wx.setStorageSync('communityInitialFilter', community);
    wx.switchTab({ url: '/pages/community/community' });
  },

  onGenerateCommunityReportTap() {
    const community = this.data.communitySummary && this.data.communitySummary.community;
    if (!community) return;
    const userType = wx.getStorageSync('userType');
    if (userType !== 'communityWorker') {
      wx.showToast({ title: '仅社区工作者可生成报告', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/community-report/index?community=${encodeURIComponent(community)}`
    });
  },

  planWalkingRoute() {
    const destination = this.data.destination;
    if (!destination || !this.isValidCoord(destination.latitude, destination.longitude)) {
      wx.showToast({
        title: '请先选择目的地',
        icon: 'none'
      });
      return Promise.resolve();
    }

    if (this.routePlanInflight) {
      return this.routePlanInflight;
    }

    const from = this.currentLocation || {
      latitude: this.data.latitude,
      longitude: this.data.longitude
    };

    if (!this.currentLocation) {
      wx.showToast({
        title: '未定位，已用地图中心作为起点',
        icon: 'none'
      });
    }

    this.setData({ routeLoading: true });

    const request = mapService.getRoute(from, destination, 'walking')
      .then((routeResult) => {
        const route = this.pickPrimaryRoute(routeResult);
        const points = this.extractRoutePoints(route, from, destination);
        if (!Array.isArray(points) || points.length < 2) {
          throw new Error('路线规划失败，请重试');
        }

        const polyline = [{
          points,
          color: '#1d4ed8',
          width: 6,
          borderColor: '#ffffff',
          borderWidth: 2
        }];

        this.activeRoutePoints = points;
        this.setData({
          polyline,
          routeActive: true,
          routeSummary: this.buildRouteSummary(route, points)
        });

        this.includeRouteInView(from, destination, points);
        return this.loadRouteObstacles(points);
      })
      .catch((err) => {
        console.error('[index] planWalkingRoute failed:', err);
        if (this.isMapQuotaExceeded(err)) {
          this.markMapQuotaExceeded('route');
          return;
        }
        wx.showToast({
          title: (err && err.message) || '路线规划失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ routeLoading: false });
        this.routePlanInflight = null;
      });

    this.routePlanInflight = request;
    return request;
  },

  pickPrimaryRoute(routeResult) {
    if (Array.isArray(routeResult)) {
      return routeResult[0] || null;
    }
    if (routeResult && Array.isArray(routeResult.routes)) {
      return routeResult.routes[0] || null;
    }
    if (routeResult && Array.isArray(routeResult.result && routeResult.result.routes)) {
      return routeResult.result.routes[0] || null;
    }
    if (routeResult && routeResult.polyline) {
      return routeResult;
    }
    return null;
  },

  extractRoutePoints(route, from, destination) {
    let points = [];

    if (route && Array.isArray(route.polyline) && route.polyline.length >= 4) {
      points = this.decodeNumericPolyline(route.polyline);
    }

    if (!points.length && route && typeof route.polyline === 'string') {
      points = this.parsePolylineString(route.polyline);
    }

    if (!points.length && route && Array.isArray(route.steps)) {
      const stepPoints = [];
      route.steps.forEach((step) => {
        if (!step) return;
        if (Array.isArray(step.polyline) && step.polyline.length >= 4) {
          stepPoints.push(...this.decodeNumericPolyline(step.polyline));
          return;
        }
        if (typeof step.polyline === 'string') {
          stepPoints.push(...this.parsePolylineString(step.polyline));
        }
      });
      points = stepPoints;
    }

    if (!points.length) {
      points = [
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: destination.latitude, longitude: destination.longitude }
      ];
    }

    return this.dedupeRoutePoints(points);
  },

  decodeNumericPolyline(polyline) {
    if (!Array.isArray(polyline) || polyline.length < 4) return [];
    const values = polyline.map((n) => Number(n));
    if (values.some((n) => !Number.isFinite(n))) return [];

    const decoded = values.slice();
    for (let i = 2; i < decoded.length; i += 1) {
      decoded[i] = decoded[i - 2] + decoded[i] / 1000000;
    }

    const points = [];
    for (let i = 0; i + 1 < decoded.length; i += 2) {
      const latitude = Number(decoded[i]);
      const longitude = Number(decoded[i + 1]);
      if (!this.isValidCoord(latitude, longitude)) continue;
      points.push({ latitude, longitude });
    }
    return points;
  },

  parsePolylineString(polyline) {
    if (!polyline || typeof polyline !== 'string') return [];
    const points = [];
    const segments = polyline.split(';');
    segments.forEach((segment) => {
      const pair = segment.split(',');
      if (pair.length < 2) return;
      const latitude = Number(pair[0]);
      const longitude = Number(pair[1]);
      if (!this.isValidCoord(latitude, longitude)) return;
      points.push({ latitude, longitude });
    });
    return points;
  },

  dedupeRoutePoints(points) {
    const deduped = [];
    let lastPoint = null;
    points.forEach((point) => {
      if (!this.isValidCoord(point.latitude, point.longitude)) return;
      if (!lastPoint) {
        deduped.push(point);
        lastPoint = point;
        return;
      }
      const distance = this.haversineDistance(lastPoint, point);
      if (distance < 1) return;
      deduped.push(point);
      lastPoint = point;
    });
    return deduped;
  },

  includeRouteInView(from, destination, routePoints) {
    if (!this.mapCtx) return;
    const sampledRoute = this.samplePoints(routePoints, 80);
    const includePoints = [
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
      ...sampledRoute
    ];
    this.mapCtx.includePoints({
      points: includePoints,
      padding: [80, 48, 280, 48]
    });
  },

  samplePoints(points, maxCount) {
    if (!Array.isArray(points) || points.length <= maxCount) {
      return points || [];
    }
    const sampled = [];
    const step = Math.ceil(points.length / maxCount);
    for (let i = 0; i < points.length; i += step) {
      sampled.push(points[i]);
    }
    const last = points[points.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
    }
    return sampled;
  },

  buildRouteSummary(route, points) {
    const routeDistance = Number(route && route.distance);
    const distance = Number.isFinite(routeDistance) && routeDistance > 0
      ? routeDistance
      : this.getPolylineLength(points);

    const routeDuration = Number(route && route.duration);
    const duration = Number.isFinite(routeDuration) && routeDuration > 0
      ? routeDuration
      : Math.round(distance / 1.2);

    return `步行约 ${this.formatDuration(duration)} · ${this.formatDistance(distance)}`;
  },

  loadRouteObstacles(routePoints) {
    if (!Array.isArray(routePoints) || routePoints.length < 2) {
      return Promise.resolve();
    }

    const bounds = this.getRouteBounds(routePoints);
    if (!bounds) {
      return Promise.resolve();
    }

    const center = bounds.center;
    const fetchRadius = Math.min(
      50000,
      Math.max(1500, Math.round(bounds.radius + ROUTE_FETCH_EXTRA_RADIUS_M))
    );
    const signature = `${center.latitude.toFixed(4)}:${center.longitude.toFixed(4)}:${fetchRadius}`;

    if (signature === this.lastRouteFetchSignature && this.routeObstaclePosts.length) {
      return Promise.resolve();
    }

    return this.fetchIssuePostsNear(center, fetchRadius, ROUTE_FETCH_PAGE_SIZE, ROUTE_FETCH_MAX_PAGES)
      .then((rows) => {
        const routeHits = [];
        rows.forEach((item) => {
          const loc = item._mapLocation || this.extractPostLocation(item);
          if (!loc) return;
          const distanceToRoute = this.getPointToPolylineDistanceMeters(loc, routePoints);
          if (!Number.isFinite(distanceToRoute) || distanceToRoute > ROUTE_HIT_THRESHOLD_M) return;
          routeHits.push({
            ...item,
            _distanceToRoute: distanceToRoute
          });
        });

        routeHits.sort((a, b) => a._distanceToRoute - b._distanceToRoute);
        this.routeObstaclePosts = routeHits;
        this.lastRouteFetchSignature = signature;

        const routeObstacles = routeHits.slice(0, 80).map((item) => ({
          postId: item._id,
          title: this.trimText(item.title || item.content || '障碍点', 22),
          address: item.formattedAddress || item.address || item.detailAddress || '',
          distanceText: `${Math.round(item._distanceToRoute)}m`
        }));

        const markers = this.buildDisplayMarkers(this.baseObstaclePosts, this.routeObstaclePosts);
        this.setData({
          routeObstacles,
          markers
        });
      })
      .catch((err) => {
        console.error('[index] loadRouteObstacles failed:', err);
        this.routeObstaclePosts = [];
        const markers = this.buildDisplayMarkers(this.baseObstaclePosts, []);
        this.setData({
          routeObstacles: [],
          markers
        });
      });
  },

  getRouteBounds(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let minLat = points[0].latitude;
    let maxLat = points[0].latitude;
    let minLng = points[0].longitude;
    let maxLng = points[0].longitude;

    points.forEach((point) => {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    });

    const center = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2
    };

    let radius = 0;
    points.forEach((point) => {
      const d = this.haversineDistance(center, point);
      if (d > radius) radius = d;
    });

    return { center, radius };
  },

  getPointToPolylineDistanceMeters(point, polylinePoints) {
    if (!Array.isArray(polylinePoints) || polylinePoints.length < 2) return Infinity;
    let minDistance = Infinity;
    for (let i = 0; i < polylinePoints.length - 1; i += 1) {
      const d = this.getPointToSegmentDistanceMeters(point, polylinePoints[i], polylinePoints[i + 1]);
      if (d < minDistance) {
        minDistance = d;
      }
    }
    return minDistance;
  },

  getPointToSegmentDistanceMeters(point, start, end) {
    const refLat = (point.latitude + start.latitude + end.latitude) / 3;
    const p = this.toMeterPoint(point, refLat);
    const a = this.toMeterPoint(start, refLat);
    const b = this.toMeterPoint(end, refLat);

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const len2 = abx * abx + aby * aby;

    if (len2 === 0) {
      return Math.sqrt(apx * apx + apy * apy);
    }

    let t = (apx * abx + apy * aby) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const nearestX = a.x + t * abx;
    const nearestY = a.y + t * aby;
    const dx = p.x - nearestX;
    const dy = p.y - nearestY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  toMeterPoint(point, refLat) {
    const latFactor = 110540;
    const lngFactor = 111320 * Math.cos((refLat * Math.PI) / 180);
    return {
      x: point.longitude * lngFactor,
      y: point.latitude * latFactor
    };
  },

  haversineDistance(from, to) {
    if (!from || !to) return Infinity;
    const lat1 = from.latitude * Math.PI / 180;
    const lng1 = from.longitude * Math.PI / 180;
    const lat2 = to.latitude * Math.PI / 180;
    const lng2 = to.longitude * Math.PI / 180;

    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
  },

  getPolylineLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      total += this.haversineDistance(points[i], points[i + 1]);
    }
    return total;
  },

  formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.round(safeSeconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!rest) return `${hours}小时`;
    return `${hours}小时${rest}分钟`;
  },

  formatDistance(meters) {
    const safeMeters = Math.max(0, Number(meters) || 0);
    if (safeMeters < 1000) return `${Math.round(safeMeters)}米`;
    return `${(safeMeters / 1000).toFixed(1)}公里`;
  },

  isMapQuotaExceeded(err) {
    if (!err) return false;
    const status = Number(err.status || err.code || (err.result && err.result.status));
    if (status === 121) return true;
    const message = String(err.message || '');
    return message.includes('达到上限') || message.includes('daily') || message.includes('limit');
  },

  markMapQuotaExceeded(scene) {
    if (!this.data.mapQuotaExceeded) {
      this.setData({
        mapQuotaExceeded: true,
        searchLoading: false,
        searchResults: []
      });
    }
    if (scene === 'route') {
      this.showMapQuotaTip('路线服务额度已用完，请更换腾讯地图Key');
      return;
    }
    this.showMapQuotaTip('搜索额度已用完，请先用地图选点');
  },

  showMapQuotaTip(message) {
    const now = Date.now();
    if (now - this.lastQuotaTipAt < 2200) return;
    this.lastQuotaTipAt = now;
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2600
    });
  },

  clearRoute() {
    this.routeObstaclePosts = [];
    this.activeRoutePoints = [];
    this.lastRouteFetchSignature = '';
    const markers = this.buildDisplayMarkers(this.baseObstaclePosts, []);
    this.setData({
      destination: null,
      destinationLabel: '',
      polyline: [],
      routeActive: false,
      routeSummary: '',
      routeObstacles: [],
      routeLoading: false,
      markers
    });
  },

  onRouteObstacleTap(e) {
    const postId = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.postId;
    if (!postId) return;
    this.openPostDetail(postId);
  }
});
