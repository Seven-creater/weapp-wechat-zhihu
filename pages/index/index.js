// 引入云开发能力
wx.cloud.init();
const app = getApp();
const QQMapWX = require("../../utils/qqmap-wx-jssdk.js");
const TENCENT_MAP_KEY = "QTABZ-SI5CL-JMMPF-MJMVG-AND33-UHFCE";
let qqmapsdk = null;

Page({
  data: {
    isUploading: false, // 是否正在上传
    hasLocationPermission: true, // 是否有定位权限
    currentAddress: "",
    currentLocation: null,
    draftDescription: "",
    isRecording: false,
  },

  onLoad: function () {
    if (!qqmapsdk) {
      qqmapsdk = new QQMapWX({
        key: TENCENT_MAP_KEY,
      });
    }
    this.initVoiceInput();
    // 检查定位权限
    this.checkLocationPermission();
  },

  onUnload: function () {
    if (this.recognitionManager) {
      this.recognitionManager.stop();
    }
  },

  initVoiceInput: function () {
    try {
      const plugin = requirePlugin("WeChatSI");
      this.recognitionManager = plugin.getRecordRecognitionManager();

      this.recognitionManager.onStart = () => {
        this.setData({ isRecording: true });
      };

      this.recognitionManager.onStop = (res) => {
        this.setData({ isRecording: false });
        const result = res.result;

        if (result && result.trim()) {
          const currentDescription = this.data.draftDescription;
          const nextDescription = currentDescription
            ? currentDescription + result
            : result;
          this.setData({ draftDescription: nextDescription });
        } else {
          wx.vibrateShort();
          wx.showToast({
            title: "未识别到语音，请重试",
            icon: "none",
          });
        }
      };

      this.recognitionManager.onError = (err) => {
        console.error("语音识别错误:", err);
        this.setData({ isRecording: false });
        wx.vibrateShort();
        wx.showToast({
          title: "语音识别失败，请重试",
          icon: "none",
        });
      };
    } catch (err) {
      console.error("初始化语音插件失败:", err);
    }
  },

  streamRecord: function () {
    if (!this.recognitionManager) {
      wx.showToast({
        title: "语音功能初始化失败",
        icon: "none",
      });
      return;
    }
    wx.vibrateShort();
    this.recognitionManager.start({
      lang: "zh_CN",
      duration: 60000,
    });
    wx.showToast({
      title: "正在听...",
      icon: "none",
      duration: 1000,
    });
  },

  endStreamRecord: function () {
    if (this.recognitionManager) {
      this.recognitionManager.stop();
    }
  },

  onDraftInput: function (e) {
    this.setData({ draftDescription: e.detail.value });
  },

  goToMapView: function () {
    wx.navigateTo({
      url: "/pages/map-view/index",
    });
  },

  loadRecentReports: function () {
    // TODO: 可根据后续需求从云端拉取最近反馈
  },

  onPullDownRefresh: function () {
    wx.stopPullDownRefresh();
  },

  checkLocationPermission: function () {
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting["scope.userLocation"]) {
          this.setData({ hasLocationPermission: false });
        }
      },
    });
  },

  takePhoto: function () {
    const that = this;

    wx.chooseMedia({
      count: 9,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      maxDuration: 30,
      camera: "back",
      success: (res) => {
        const tempFilePaths = res.tempFiles
          .map((file) => file.tempFilePath)
          .filter(Boolean);

        if (tempFilePaths.length === 0) {
          wx.showToast({
            title: "未选择图片",
            icon: "none",
          });
          return;
        }

        let locationPromise;
        const existingAddress = that.data.currentAddress;
        const existingLocation = that.data.currentLocation;

        if (
          existingAddress &&
          existingAddress !== "定位中" &&
          existingLocation
        ) {
          locationPromise = Promise.resolve({
            latitude: existingLocation.latitude,
            longitude: existingLocation.longitude,
            address: existingAddress,
            formattedAddress: existingAddress,
          });
        } else {
          locationPromise = that.getLocation();
        }

        locationPromise
          .then((location) => {
            wx.setStorageSync("issueDraftTemp", {
              images: tempFilePaths,
              location: location,
              description: that.data.draftDescription || "",
            });
            wx.navigateTo({
              url: "/pages/issue-edit/index?fromCapture=1",
            });
          })
          .catch((err) => {
            console.error("获取位置失败:", err);
            wx.showToast({
              title: "定位失败，请检查权限",
              icon: "none",
            });
          });
      },
      fail: (err) => {
        console.error("选择图片失败:", err);
        wx.showToast({
          title: "选择图片失败",
          icon: "none",
        });
      },
    });
  },

  reselectLocation: function () {
    this.chooseLocationManual();
  },

  getLocation: function () {
    return this.getAutoLocation().catch(() => this.chooseLocationManual());
  },

  getAutoLocation: function () {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: "gcj02",
        altitude: true,
        success: (res) => {
          const { latitude, longitude } = res;
          if (!qqmapsdk) {
            return reject(new Error("未初始化地图SDK"));
          }
          qqmapsdk.reverseGeocoder({
            location: {
              latitude,
              longitude,
            },
            success: (result) => {
              const address = (result.result && result.result.address) || "";
              const formattedAddress =
                (result.result &&
                  result.result.formatted_addresses &&
                  result.result.formatted_addresses.recommend) ||
                address;
              const location = {
                latitude,
                longitude,
                address: address || "定位成功",
                formattedAddress: formattedAddress || address || "定位成功",
              };
              this.setData({
                currentAddress: location.formattedAddress || location.address,
                currentLocation: {
                  latitude,
                  longitude,
                },
              });
              resolve(location);
            },
            fail: () => {
              const location = {
                latitude,
                longitude,
                address: "定位成功",
                formattedAddress: "定位成功",
              };
              this.setData({
                currentAddress: location.formattedAddress,
                currentLocation: {
                  latitude,
                  longitude,
                },
              });
              resolve(location);
            },
          });
        },
        fail: (err) => {
          reject(err);
        },
      });
    });
  },

  chooseLocationManual: function () {
    return new Promise((resolve, reject) => {
      wx.chooseLocation({
        success: (res) => {
          const latitude = res.latitude;
          const longitude = res.longitude;
          const location = {
            latitude,
            longitude,
            address: res.address || res.name || "手动选点",
            formattedAddress: res.address || res.name || "手动选点",
          };
          this.setData({
            currentAddress: location.formattedAddress || location.address,
            currentLocation: {
              latitude,
              longitude,
            },
          });
          resolve(location);
        },
        fail: (err) => {
          reject(err);
        },
      });
    });
  },

  navigateToSolutions: function () {
    wx.switchTab({
      url: "/pages/solutions/index",
    });
  },

  navigateToCommunity: function () {
    wx.switchTab({
      url: "/pages/community/community",
    });
  },

  navigateToReport: function () {
    wx.navigateTo({
      url: "/pages/scheme/scheme",
    });
  },

  navigateToHistory: function () {
    wx.navigateTo({
      url: "/pages/my-issues/index",
    });
  },
});
// 数据库 schema 定义
/**
 * issues 集合结构
 * {
 *   _id: string, // 文档ID
 *   _openid: string, // 用户openid
 *   imageUrl: string, // 图片链接（云存储fileID）
 *   location: GeoPoint, // 地理位置
 *   address: string, // 详细地址
 *   formattedAddress: string, // 格式化地址
 *   description: string, // 用户描述（可选）
 *   aiSolution: string, // AI给出的改造建议
 *   status: string, // 状态：pending(待处理)/reported(已上报)
 *   createTime: Date, // 创建时间
 *   updateTime: Date // 更新时间
 * }
 */
