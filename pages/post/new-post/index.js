const app = getApp();
const db = wx.cloud.database();

const getFileExt = (filePath) => {
  const parts = String(filePath || "").split(".");
  const ext = parts[parts.length - 1];
  return ext || "jpg";
};

Page({
  data: {
    images: [],
    title: "",
    content: "",
    locationName: "",
    latitude: null,
    longitude: null,
    postType: "community",
  },

  onLoad: function (options) {
    if (options && options.image) {
      this.setData({ images: [decodeURIComponent(options.image)] });
    }
  },

  cancelPost: function () {
    wx.navigateBack();
  },

  chooseImage: function () {
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const newImages = (res.tempFiles || []).map((file) => file.tempFilePath);
        this.setData({ images: (this.data.images || []).concat(newImages) });
      },
      fail: () => {},
    });
  },

  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: this.data.images || [] });
  },

  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = Array.isArray(this.data.images) ? this.data.images.slice() : [];
    images.splice(index, 1);
    this.setData({ images });
  },

  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          locationName: res.name,
          latitude: res.latitude,
          longitude: res.longitude,
        });
      },
      fail: () => {},
    });
  },

  setPostType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ postType: type });
  },

  uploadImagesToCloud: function (paths) {
    const uploads = (paths || []).map((filePath, index) => {
      const fileExt = getFileExt(filePath);
      const cloudPath = `posts/${Date.now()}-${index}.${fileExt}`;
      return wx.cloud
        .uploadFile({ cloudPath, filePath })
        .then((res) => res.fileID);
    });
    return Promise.all(uploads);
  },

  ensureLogin: function () {
    return app.checkLogin().catch(() => {
      return new Promise((resolve, reject) => {
        wx.showModal({
          title: "提示",
          content: "请先登录",
          confirmText: "去登录",
          cancelText: "取消",
          success: (res) => {
            if (!res.confirm) {
              reject(new Error("未登录"));
              return;
            }
            app
              .login()
              .then(() => resolve())
              .catch((err) => reject(err));
          },
        });
      });
    });
  },

  checkTextSafe: function (value) {
    const text = String(value || "").trim();
    if (!text) return Promise.resolve();
    return wx.cloud
      .callFunction({ name: "checkContent", data: { type: "text", value: text } })
      .then((res) => {
        if (res?.result?.code !== 0) {
          throw new Error("内容含有违法违规信息，禁止发布！");
        }
      });
  },

  submitPost: async function () {
    const content = String(this.data.content || "").trim();
    const title = String(this.data.title || "").trim();
    const images = Array.isArray(this.data.images) ? this.data.images : [];
    const postType = this.data.postType === "case" ? "case" : "community";

    if (!content && images.length === 0) {
      wx.showToast({ title: "请输入正文或选择图片", icon: "none" });
      return;
    }

    wx.showLoading({ title: "发布中..." });

    try {
      await this.ensureLogin();
      await this.checkTextSafe(title);
      await this.checkTextSafe(content);

      const fileIDs = await this.uploadImagesToCloud(images);

      const userInfo = app.globalData.userInfo || {};
      const data = {
        title: title || undefined,
        content: content || "",
        images: fileIDs,
        type: postType,
        stats: { view: 0, like: 0, comment: 0 },
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        userInfo: {
          nickName: userInfo.nickName || "匿名用户",
          avatarUrl: userInfo.avatarUrl || "/images/zhi.png",
        },
      };

      if (typeof this.data.latitude === "number" && typeof this.data.longitude === "number") {
        data.location = new db.Geo.Point(this.data.longitude, this.data.latitude);
        data.address = this.data.locationName || "";
      }

      await db.collection("posts").add({ data });

      wx.setStorageSync("communityInitialTab", postType === "case" ? 2 : 1);
      wx.hideLoading();
      wx.showToast({ title: "发布成功", icon: "success" });
      setTimeout(() => {
        wx.switchTab({ url: "/pages/community/community" });
      }, 600);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "发布失败", icon: "none" });
    }
  },
});
