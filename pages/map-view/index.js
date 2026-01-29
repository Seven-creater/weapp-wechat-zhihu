Page({
  data: {
    markers: [],
    latitude: 0,
    longitude: 0,
    loading: true,
  },

  onLoad: function () {
    this.getUserLocation();
    this.loadIssues();
  },

  getUserLocation: function () {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
        });
      },
      fail: () => {
        this.setData({
          latitude: 39.9042,
          longitude: 116.4074,
        });
      },
    });
  },

  loadIssues: function () {
    this.setData({ loading: true });
    wx.cloud
      .callFunction({
        name: "getPublicData",
        data: {
          collection: "issues",
          page: 1,
          pageSize: 200,
          orderBy: "createTime",
          order: "desc",
        },
      })
      .then((res) => {
        if (res.result && res.result.success) {
          const issues = res.result.data || [];
          const markers = issues
            .map((issue) => this.issueToMarker(issue))
            .filter(Boolean);
          this.setData({ markers });
        } else {
          throw new Error(res.result?.error || "加载失败");
        }
      })
      .catch((err) => {
        console.error("加载路障失败:", err);
        wx.showToast({
          title: "加载失败",
          icon: "none",
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  issueToMarker: function (issue) {
    const location = issue.location;
    let latitude = 0;
    let longitude = 0;

    if (location && typeof location === "object") {
      if (typeof location.latitude === "number") {
        latitude = location.latitude;
        longitude = location.longitude;
      } else if (
        Array.isArray(location.coordinates) &&
        location.coordinates.length >= 2
      ) {
        longitude = Number(location.coordinates[0]);
        latitude = Number(location.coordinates[1]);
      }
    }

    if (!latitude || !longitude) {
      return null;
    }

    const title =
      issue.description || issue.content || issue.address || "路障反馈";

    return {
      id: issue._id,
      latitude,
      longitude,
      iconPath: "/images/marker_alert.svg",
      width: 28,
      height: 28,
      callout: {
        content: title.length > 14 ? `${title.slice(0, 14)}...` : title,
        color: "#002fa7",
        fontSize: 12,
        borderRadius: 6,
        padding: 6,
        bgColor: "#ffffff",
        display: "BYCLICK",
      },
    };
  },

  handleMarkerTap: function (e) {
    const markerId = e.markerId;
    if (!markerId) return;
      url: `/pages/solution-detail/index?id=${markerId}&collection=issues`,
      url: `/pages/issue-detail/issue-detail?id=${markerId}`,
    });
  },
});
