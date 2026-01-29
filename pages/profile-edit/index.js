// pages/profile-edit/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    form: {
      avatarUrl: "",
      nickName: "",
    },
    saving: false,
  },

  onLoad: function () {
    this.loadUserInfo();
  },

  onShow: function () {
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo: function () {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({
      form: {
        avatarUrl: userInfo.avatarUrl || "",
        nickName: userInfo.nickName || "",
      },
    });
  },

  // 头像选择回调
  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail;
    this.setData({
      "form.avatarUrl": avatarUrl,
    });
  },

  // 昵称输入回调
  onNameInput: function (e) {
    this.setData({
      "form.nickName": e.detail.value,
    });
  },

  // 昵称失焦回调（用于 type="nickname"）
  onNameBlur: function (e) {
    const { value } = e.detail;
    if (value) {
      this.setData({
        "form.nickName": value,
      });
    }
  },

  // 保存资料
  saveProfile: function () {
    if (this.data.saving) return;

    const { avatarUrl, nickName } = this.data.form;
    const trimmedName = (nickName || "").trim();

    if (!trimmedName) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中..." });

    // 判断是否需要上传新头像
    const isTemp = /^wxfile:|^https?:\/\/tmp\//.test(avatarUrl || "");
    const needsUpload =
      avatarUrl && isTemp && !avatarUrl.startsWith("cloud://");

    this.uploadAvatarIfNeeded(avatarUrl, needsUpload)
      .then((finalAvatarUrl) => {
        // 构建新用户数据
        const newUserInfo = {
          ...(wx.getStorageSync("userInfo") || {}),
          avatarUrl: finalAvatarUrl,
          nickName: trimmedName,
        };

        // 更新本地存储
        wx.setStorageSync("userInfo", newUserInfo);
        app.globalData.userInfo = newUserInfo;

        // 同步到云端
        return this.syncToCloud(newUserInfo);
      })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "保存成功", icon: "success" });

        // 返回上一页并刷新
        const pages = getCurrentPages();
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.setData) {
            prevPage.setData({ userInfo: wx.getStorageSync("userInfo") });
          }
        }

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      })
      .catch((err) => {
        wx.hideLoading();
        console.error("保存资料失败:", err);
        wx.showToast({ title: "保存失败，请重试", icon: "none" });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  },

  // 上传头像到云存储
  uploadAvatarIfNeeded: function (avatarUrl, needsUpload) {
    if (!needsUpload) {
      return Promise.resolve(avatarUrl);
    }

    return wx.cloud
      .uploadFile({
        cloudPath: `avatars/${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}.jpg`,
        filePath: avatarUrl,
      })
      .then((res) => {
        return res.fileID;
      });
  },

  // 同步到云端数据库
  syncToCloud: function (userInfo) {
    const openid = app.globalData.openid || wx.getStorageSync("openid");

    if (!openid) {
      return Promise.reject(new Error("缺少 openid"));
    }

    return db
      .collection("users")
      .where({ _openid: openid })
      .get()
      .then((res) => {
        if (res.data.length > 0) {
          // 更新现有记录
          return db
            .collection("users")
            .doc(res.data[0]._id)
            .update({
              data: {
                nickName: userInfo.nickName,
                avatarUrl: userInfo.avatarUrl,
                updatedAt: db.serverDate(),
              },
            });
        } else {
          // 创建新记录
          return db.collection("users").add({
            data: {
              nickName: userInfo.nickName,
              avatarUrl: userInfo.avatarUrl,
              createTime: db.serverDate(),
              updatedAt: db.serverDate(),
            },
          });
        }
      });
      .ensureOpenid()
      .then((openid) => app.upsertUserProfile(openid, userInfo));
  },
});
