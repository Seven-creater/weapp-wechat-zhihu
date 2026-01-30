const QQMapWX = require("../../utils/qqmap-wx-jssdk.js");

// 延迟初始化数据库，避免在云开发初始化前调用
let db = null;
let _ = null;

const getDB = () => {
  if (!db) {
    db = wx.cloud.database();
    _ = db.command;
  }
  return { db, _ };
};

const TENCENT_MAP_KEY = "QTABZ-SI5CL-JMMPF-MJMVG-AND33-UHFCE";
let qqmapsdk = null;

const facilityCategories = [
  {
    id: "accessible_parking",
    name: "无障碍停车位",
    shortName: "停车位",
    keyword: "无障碍停车位",
    icon: "/images/category_parking.png",
  },
  {
    id: "accessible_toilet",
    name: "无障碍卫生间",
    shortName: "卫生间",
    keyword: "无障碍卫生间",
    icon: "/images/category_restroom.png",
  },
  {
    id: "ramp",
    name: "无障碍坡道",
    shortName: "坡道",
    keyword: "无障碍坡道",
    icon: "/images/category_slope.png",
  },
  {
    id: "lift",
    name: "无障碍电梯",
    shortName: "电梯",
    keyword: "无障碍电梯",
    icon: "/images/category_elevator.png",
  },
  {
    id: "stairs",
    name: "无障碍升降台",
    shortName: "升降台",
    keyword: "无障碍升降台",
    icon: "/images/category_lift.png",
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatDistance = (meters) => {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return "";
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
};

const toRad = (deg) => (Number(deg) * Math.PI) / 180;
const distanceMeters = (aLat, aLng, bLat, bLng) => {
  const R = 6371000;
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLat = lat2 - lat1;
  const dLng = toRad(bLng) - toRad(aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const toStars = (rating) => {
  const n = clamp(Math.round(Number(rating) || 0), 0, 5);
  return Array.from({ length: 5 }).map((_, idx) => idx < n);
};

const findCategoryById = (categoryId) =>
  facilityCategories.find((c) => c.id === categoryId) || facilityCategories[0];

const findCategoryByName = (name) =>
  facilityCategories.find((c) => c.name === name) || null;

Page({
  data: {
    latitude: 23.099994,
    longitude: 113.32452,
    scale: 14,
    markers: [],
    categories: facilityCategories,
    currentCategoryId: "accessible_toilet",
    chips: [],
    currentChipId: "all",
    facilities: [],
    issues: [],
    selectedFacility: null,
    nearbyOfSelected: [],
    loading: false,
    sheetMode: "list",
    sheetHeights: { collapsed: 170, list: 420, detail: 380 },
    sheetHeight: 170,
    dragging: false,
    topInset: 40,
    safeBottom: 0,
    searchVisible: false,
    searchKeyword: "",
    searchResults: [],
    searchLoading: false,
  },

  onLoad: function () {
    if (!qqmapsdk) {
      qqmapsdk = new QQMapWX({ key: TENCENT_MAP_KEY });
    }

    const system = wx.getSystemInfoSync();
    const topInset = (system.statusBarHeight || 24) + 10;
    const safeBottom = system.safeArea
      ? system.screenHeight - system.safeArea.bottom
      : 0;

    this.setData({
      topInset,
      safeBottom: Math.max(0, safeBottom),
    });

    this.syncChips();
    this.setSheetMode("collapsed");
    this.getLocationAndLoad();
  },

  syncChips: function () {
    const chips = [
      { id: "all", name: "全部" },
      ...this.data.categories.map((c) => ({
        id: c.id,
        name: c.shortName || c.name,
      })),
    ];
    this.setData({ chips });
  },

  setSheetMode: function (mode) {
    const sheetHeights = this.data.sheetHeights || {};
    const nextHeight = sheetHeights[mode] || sheetHeights.list || 380;
    this.setData({ sheetMode: mode, sheetHeight: nextHeight });
  },

  onSheetTouchStart: function (e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._sheetDragStartY = touch.clientY;
    this._sheetDragStartHeight = Number(this.data.sheetHeight) || 0;
    this._sheetDragStartTime = Date.now();
    this._sheetDragLastY = touch.clientY;
    this._sheetDragLastTime = this._sheetDragStartTime;
    this._sheetDragRafLock = false;
    this.setData({ dragging: true });
  },

  onSheetTouchMove: function (e) {
    if (!this.data.dragging) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;

    const startY = Number(this._sheetDragStartY);
    const startHeight = Number(this._sheetDragStartHeight);
    if (!Number.isFinite(startY) || !Number.isFinite(startHeight)) return;

    const delta = startY - touch.clientY;
    const heights = this.data.sheetHeights || {};
    const minH = Number(heights.collapsed) || 120;
    const listH = Number(heights.list) || 380;
    const detailH = Number(heights.detail) || listH;
    const maxH = Math.max(listH, this.data.selectedFacility ? detailH : listH);
    const nextHeight = clamp(startHeight + delta, minH, maxH);

    const now = Date.now();
    this._sheetDragLastY = touch.clientY;
    this._sheetDragLastTime = now;

    if (this._sheetDragRafLock) return;
    this._sheetDragRafLock = true;
    setTimeout(() => {
      this._sheetDragRafLock = false;
      if (!this.data.dragging) return;
      this.setData({ sheetHeight: nextHeight });
    }, 16);
  },

  onSheetTouchEnd: function () {
    if (!this.data.dragging) return;

    const heights = this.data.sheetHeights || {};
    const collapsedH = Number(heights.collapsed) || 120;
    const listH = Number(heights.list) || 380;
    const detailH = Number(heights.detail) || listH;
    const currentH = Number(this.data.sheetHeight) || collapsedH;

    const now = Date.now();
    const lastY = Number(this._sheetDragLastY);
    const lastT = Number(this._sheetDragLastTime);
    const startY = Number(this._sheetDragStartY);
    const startT = Number(this._sheetDragStartTime);

    const dt = Math.max(1, now - (Number.isFinite(lastT) ? lastT : now));
    const dy =
      Number.isFinite(lastY) && Number.isFinite(startY) ? lastY - startY : 0;
    const totalDt = Math.max(1, now - (Number.isFinite(startT) ? startT : now));
    const velocity = dy / totalDt;

    const candidates = [
      { mode: "collapsed", height: collapsedH },
      { mode: "list", height: listH },
    ];
    if (this.data.selectedFacility) {
      candidates.push({ mode: "detail", height: detailH });
    }

    const absV = Math.abs(velocity);
    let targetMode = "list";
    if (absV > 0.55) {
      if (velocity > 0) {
        targetMode =
          currentH <= (collapsedH + listH) / 2 ? "collapsed" : "list";
      } else {
        targetMode = this.data.selectedFacility ? "detail" : "list";
      }
    } else {
      let best = candidates[0];
      let bestDist = Math.abs(currentH - best.height);
      candidates.slice(1).forEach((c) => {
        const dist = Math.abs(currentH - c.height);
        if (dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      });
      targetMode = best.mode;
    }

    this.setData({ dragging: false }, () => {
      if (this.data.sheetMode === "detail" && targetMode !== "detail") {
        if (targetMode === "collapsed") {
          this.closeDetailToList();
          this.setSheetMode("collapsed");
          return;
        }
        this.closeDetailToList();
        return;
      }
      if (targetMode === "detail" && !this.data.selectedFacility) {
        this.setSheetMode("list");
        return;
      }
      this.setSheetMode(targetMode);
    });
  },

  getLocationAndLoad: function () {
    this.setData({ loading: true });
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData(
          {
            latitude: res.latitude,
            longitude: res.longitude,
          },
          () => {
            this.loadFacilitiesAroundCenter();
            this.loadIssuesAroundCenter();
          },
        );
      },
      fail: () => {
        this.setData({ loading: false });
        this.loadFacilitiesAroundCenter();
        this.loadIssuesAroundCenter();
      },
    });
  },

  loadFacilitiesAroundCenter: function () {
    const category = findCategoryById(this.data.currentCategoryId);
    const keyword = category ? category.keyword : "无障碍设施";
    const location = {
      latitude: this.data.latitude,
      longitude: this.data.longitude,
    };

    this.setData({ loading: true });

    qqmapsdk.search({
      keyword,
      location,
      page_size: 20,
      success: (res) => {
        const items = (res.data || [])
          .map((poi, index) => {
            const lat = poi.location?.lat;
            const lng = poi.location?.lng;
            const meters = poi._distance;
            const rating = poi?.ad_info?.rating || poi?.rating || 0;
            return {
              id: poi.id || `${category.id}-${index}`,
              name: poi.title || poi.name || "未命名地点",
              address: poi.address || poi?.ad_info?.address || "",
              categoryId: category.id,
              categoryName: category.shortName || category.name,
              icon: category.icon,
              latitude: lat,
              longitude: lng,
              distanceMeters: typeof meters === "number" ? meters : null,
              distanceText:
                typeof meters === "number" ? formatDistance(meters) : "",
              rating: rating,
              stars: toStars(rating),
            };
          })
          .filter(
            (x) =>
              typeof x.latitude === "number" && typeof x.longitude === "number",
          );

        if (items.length === 0) {
          this.loadSolutionsAsFacilities();
          return;
        }

        this.setData({ facilities: items }, () => {
          this.updateMarkers();
          if (this.data.sheetMode === "detail" && this.data.selectedFacility) {
            const selected =
              items.find((it) => it.id === this.data.selectedFacility.id) ||
              this.data.selectedFacility;
            this.setData({ selectedFacility: selected });
          }
        });
      },
      fail: (err) => {
        console.error("加载点位失败，回退到案例库数据", err);
        this.loadSolutionsAsFacilities().finally(() => {
          this.setData({ loading: false });
        });
      },
      complete: () => {
        this.setData({ loading: false });
      },
    });
  },

  loadSolutionsAsFacilities: async function () {
    const latitude = Number(this.data.latitude);
    const longitude = Number(this.data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      this.setData({ facilities: [] }, () => this.updateMarkers());
      return;
    }

    const category = findCategoryById(this.data.currentCategoryId);
    const near = { latitude, longitude, maxDistance: 10000 };

    const fetch = async (options) => {
      const res = await wx.cloud.callFunction({
        name: "getPublicData",
        data: {
          collection: "solutions",
          page: 1,
          pageSize: 30,
          orderBy: "createTime",
          order: "desc",
          category: options.category || undefined,
          status: options.status || undefined,
          near: options.useNear ? near : undefined,
        },
      });
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || "加载失败");
      }
      return res.result.data || [];
    };

    let list = [];
    try {
      list = await fetch({
        category: category?.name,
        status: "已完成",
        useNear: true,
      });
      if (list.length === 0) {
        list = await fetch({ status: "已完成", useNear: true });
      }
      if (list.length === 0) {
        list = await fetch({ status: "已完成", useNear: false });
      }
      if (list.length === 0) {
        list = await fetch({ useNear: false });
      }
    } catch (err) {
      console.error("加载案例库失败", err);
      this.setData({ facilities: [] }, () => this.updateMarkers());
      return;
    }

    const items = list
      .map((item) => {
        const coords = item.location?.coordinates;
        const lng = Array.isArray(coords)
          ? Number(coords[0])
          : Number(item.location?.longitude);
        const lat = Array.isArray(coords)
          ? Number(coords[1])
          : Number(item.location?.latitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const dist = distanceMeters(latitude, longitude, lat, lng);
        const matched = item.category
          ? findCategoryByName(item.category)
          : null;
        const icon = matched
          ? matched.icon
          : category?.icon || "/images/flag.png";
        const catId = matched ? matched.id : category?.id || "all";

        return {
          id: item._id,
          name: item.title || "无障碍案例",
          address: item.formattedAddress || item.address || "",
          categoryId: catId,
          categoryName: item.category || category?.name || "案例",
          icon,
          latitude: lat,
          longitude: lng,
          distanceMeters: dist,
          distanceText: formatDistance(dist),
          rating: 0,
          stars: toStars(0),
          source: "solutions",
        };
      })
      .filter(Boolean);

    this.setData({ facilities: items }, () => this.updateMarkers());
  },

  loadIssuesAroundCenter: function () {
    const latitude = Number(this.data.latitude);
    const longitude = Number(this.data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const { db, _ } = getDB();
    const center = new db.Geo.Point(longitude, latitude);

    db.collection("issues")
      .where({
        location: _.geoNear({
          geometry: center,
          maxDistance: 5000,
          minDistance: 0,
        }),
      })
      .limit(50)
      .get()
      .then((res) => {
        const items = (res.data || [])
          .map((it) => {
            const p = it.location;
            const lat = p && typeof p.latitude === "number" ? p.latitude : null;
            const lng =
              p && typeof p.longitude === "number" ? p.longitude : null;
            const meters =
              typeof lat === "number" && typeof lng === "number"
                ? distanceMeters(latitude, longitude, lat, lng)
                : null;
            return {
              id: it._id,
              category: it.category || "障碍点",
              description: it.description || "",
              status: it.status || "pending",
              address: it.formattedAddress || it.address || "",
              latitude: lat,
              longitude: lng,
              distanceMeters: meters,
              distanceText:
                typeof meters === "number" ? formatDistance(meters) : "",
            };
          })
          .filter(
            (x) =>
              typeof x.latitude === "number" && typeof x.longitude === "number",
          );

        this.setData({ issues: items }, () => {
          this.updateMarkers();
        });
      })
      .catch(() => {
        const { db } = getDB();
        db.collection("issues")
          .orderBy("createTime", "desc")
          .limit(50)
          .get()
          .then((res) => {
            const items = (res.data || [])
              .map((it) => {
                const p = it.location;
                const lat =
                  p && typeof p.latitude === "number" ? p.latitude : null;
                const lng =
                  p && typeof p.longitude === "number" ? p.longitude : null;
                const meters =
                  typeof lat === "number" && typeof lng === "number"
                    ? distanceMeters(latitude, longitude, lat, lng)
                    : null;
                return {
                  id: it._id,
                  category: it.category || "障碍点",
                  description: it.description || "",
                  status: it.status || "pending",
                  address: it.formattedAddress || it.address || "",
                  latitude: lat,
                  longitude: lng,
                  distanceMeters: meters,
                  distanceText:
                    typeof meters === "number" ? formatDistance(meters) : "",
                };
              })
              .filter(
                (x) =>
                  typeof x.latitude === "number" &&
                  typeof x.longitude === "number",
              );
            this.setData({ issues: items }, () => this.updateMarkers());
          })
          .catch(() => {
            this.setData({ issues: [] }, () => this.updateMarkers());
          });
      });
  },

  updateMarkers: function () {
    const facilityMarkers = (this.data.facilities || []).map((item, idx) => {
      const isSelected =
        this.data.selectedFacility && this.data.selectedFacility.id === item.id;
      return {
        id: idx + 1,
        latitude: item.latitude,
        longitude: item.longitude,
        width: isSelected ? 34 : 28,
        height: isSelected ? 34 : 28,
        iconPath: "/images/marker_alert.svg",
        callout: {
          content:
            item.name.length > 16 ? `${item.name.slice(0, 16)}...` : item.name,
          color: "#111827",
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: "#ffffff",
          display: "BYCLICK",
        },
        payload: { type: "facility", id: item.id },
      };
    });

    const offset = facilityMarkers.length;
    const issueMarkers = (this.data.issues || []).map((item, idx) => {
      const title = item.category ? `【${item.category}】` : "【障碍点】";
      const label = item.description ? item.description : "查看详情";
      const contentBase = `${title}${label}`;
      const content =
        contentBase.length > 18
          ? `${contentBase.slice(0, 18)}...`
          : contentBase;
      return {
        id: offset + idx + 1,
        latitude: item.latitude,
        longitude: item.longitude,
        width: 28,
        height: 28,
        iconPath: "/images/flag.png",
        callout: {
          content,
          color: "#111827",
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: "#ffffff",
          display: "BYCLICK",
        },
        payload: { type: "issue", id: item.id },
      };
    });

    this.setData({ markers: facilityMarkers.concat(issueMarkers) });
  },

  onCategoryTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.currentCategoryId) return;
    this.setData(
      {
        currentCategoryId: id,
        currentChipId: "all",
        selectedFacility: null,
        nearbyOfSelected: [],
      },
      () => {
        this.setSheetMode("list");
        this.loadFacilitiesAroundCenter();
      },
    );
  },

  onChipTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.currentChipId) return;

    if (id === "all") {
      this.setData({ currentChipId: id }, () =>
        this.loadFacilitiesAroundCenter(),
      );
      return;
    }

    this.setData(
      {
        currentChipId: id,
        currentCategoryId: id,
        selectedFacility: null,
        nearbyOfSelected: [],
      },
      () => {
        this.setSheetMode("list");
        this.loadFacilitiesAroundCenter();
      },
    );
  },

  onSheetHandleTap: function () {
    if (this.data.sheetMode === "detail") {
      this.closeDetailToList();
      return;
    }

    if (this.data.sheetMode === "collapsed") {
      this.setSheetMode("list");
      return;
    }

    this.setSheetMode("collapsed");
  },

  handleMarkerTap: function (e) {
    const markerId = e.markerId;
    const idx = Number(markerId) - 1;
    if (!Number.isFinite(idx)) return;
    const marker = (this.data.markers || [])[idx];
    if (!marker || !marker.payload) return;

    if (marker.payload.type === "issue") {
      wx.navigateTo({
        url: `/pages/issue-detail/issue-detail?id=${marker.payload.id}`,
      });
      return;
    }

    const facility = (this.data.facilities || []).find(
      (f) => f.id === marker.payload.id,
    );
    if (facility) {
      this.openFacilityDetail(facility);
    }
  },

  onFacilityTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const facility = (this.data.facilities || []).find((f) => f.id === id);
    if (!facility) return;
    if (facility.source === "solutions") {
      wx.navigateTo({
        url: `/pages/case-detail/case-detail?postId=${facility.id}`,
      });
      return;
    }
    this.openFacilityDetail(facility);
  },

  openFacilityDetail: function (facility) {
    this.setData({ selectedFacility: facility }, () => {
      this.setSheetMode("detail");
      this.updateMarkers();
      this.loadNearbyOfSelected();
    });
  },

  closeDetailToList: function () {
    this.setData({ selectedFacility: null, nearbyOfSelected: [] }, () => {
      this.setSheetMode("list");
      this.updateMarkers();
    });
  },

  loadNearbyOfSelected: function () {
    const selected = this.data.selectedFacility;
    if (!selected) return;
    const location = {
      latitude: selected.latitude,
      longitude: selected.longitude,
    };
    qqmapsdk.search({
      keyword: "无障碍坡道",
      location,
      page_size: 8,
      success: (res) => {
        const items = (res.data || [])
          .map((poi, index) => {
            const lat = poi.location?.lat;
            const lng = poi.location?.lng;
            const meters = poi._distance;
            const rating = poi?.rating || 0;
            return {
              id: poi.id || `near-${index}`,
              name: poi.title || poi.name || "附近设施",
              latitude: lat,
              longitude: lng,
              distanceText:
                typeof meters === "number" ? formatDistance(meters) : "",
              stars: toStars(rating),
            };
          })
          .filter(
            (x) =>
              typeof x.latitude === "number" && typeof x.longitude === "number",
          );
        this.setData({ nearbyOfSelected: items.slice(0, 6) });
      },
      fail: (err) => {
        console.error("加载附近设施失败", err);
        this.setData({ nearbyOfSelected: [] });
      },
    });
  },

  onReportTap: function () {
    wx.navigateTo({ url: "/pages/issue-edit/index" });
  },

  onCameraTap: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera"],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.navigateTo({
          url: `/pages/issue-edit/index?image=${encodeURIComponent(tempFilePath)}`,
        });
      },
      fail: () => {},
    });
  },

  onCenterTap: function () {
    this.getLocationAndLoad();
  },

  onLayerTap: function () {
    wx.showToast({ title: "图层功能开发中", icon: "none" });
  },

  onSearchTap: function () {
    this.setData({ searchVisible: true, searchKeyword: "", searchResults: [] });
  },

  onSearchClose: function () {
    this.setData({
      searchVisible: false,
      searchKeyword: "",
      searchResults: [],
    });
  },

  onSearchInput: function (e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    if (!keyword || !keyword.trim()) {
      this.setData({ searchResults: [] });
      return;
    }
    this.fetchSuggestions(keyword.trim());
  },

  fetchSuggestions: function (keyword) {
    this.setData({ searchLoading: true });
    qqmapsdk.getSuggestion({
      keyword,
      location: {
        latitude: this.data.latitude,
        longitude: this.data.longitude,
      },
      page_size: 12,
      success: (res) => {
        const items = (res.data || [])
          .map((item) => {
            const lat = item.location?.lat;
            const lng = item.location?.lng;
            return {
              id: item.id || item.title,
              title: item.title,
              address: item.address || item.province || "",
              latitude: lat,
              longitude: lng,
            };
          })
          .filter(
            (x) =>
              typeof x.latitude === "number" && typeof x.longitude === "number",
          );
        this.setData({ searchResults: items });
      },
      fail: (err) => {
        console.error("搜索失败", err);
        this.setData({ searchResults: [] });
      },
      complete: () => {
        this.setData({ searchLoading: false });
      },
    });
  },

  onSearchSelect: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.searchResults || []).find((x) => x.id === id);
    if (!item) return;
    this.setData(
      {
        latitude: item.latitude,
        longitude: item.longitude,
        scale: 15,
        searchVisible: false,
        searchKeyword: "",
        searchResults: [],
      },
      () => {
        this.loadFacilitiesAroundCenter();
      },
    );
  },

  onGoTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const facility =
      (this.data.facilities || []).find((f) => f.id === id) ||
      (this.data.nearbyOfSelected || []).find((f) => f.id === id) ||
      this.data.selectedFacility;
    if (!facility) return;
    wx.openLocation({
      latitude: facility.latitude,
      longitude: facility.longitude,
      name: facility.name,
      address: facility.address || "",
      scale: 18,
    });
  },
});
