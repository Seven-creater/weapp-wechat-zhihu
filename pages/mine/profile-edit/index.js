Page({
  data: {
    form: {
      avatarUrl: "",
      nickName: "",
    },
    original: {
      avatarUrl: "",
      nickName: "",
    },
    saving: false,
  },

  onLoad: function () {
    const storedUserInfo = wx.getStorageSync("userInfo") || {};
    const avatarUrl = storedUserInfo.avatarUrl || "";
    const nickName = storedUserInfo.nickName || "";

    this.setData({
      form: { avatarUrl, nickName },
      original: { avatarUrl, nickName },
    });
  },

  onNameInput: function (e) {
    const value = e.detail.value;
    this.setData({
      form: {
        ...this.data.form,
        nickName: value,
      },
    });
  },

  onChooseAvatar: function (e) {
    const avatarUrl = e.detail.avatarUrl;
    if (avatarUrl) {
      this.setData({
        form: {
          ...this.data.form,
          avatarUrl: avatarUrl,
        },
      });
    }
  },

  chooseAvatar: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const filePath = res.tempFilePaths && res.tempFilePaths[0];
        if (!filePath) return;
        this.setData({
          form: {
            ...this.data.form,
            avatarUrl: filePath,
          },
        });
      },
      fail: () => {
        wx.showToast({ title: "选择头像失败", icon: "none" });
      },
    });
  },

  syncWechatProfile: function () {
    wx.getUserProfile({
      desc: "同步微信头像昵称",
      success: (res) => {
        const userInfo = res.userInfo || {};
        this.setData({
          form: {
            ...this.data.form,
            avatarUrl: userInfo.avatarUrl || "",
            nickName: userInfo.nickName || "",
          },
        });
      },
      fail: () => {
        wx.showToast({ title: "同步失败", icon: "none" });
      },
    });
  },

  saveProfile: function () {
    if (this.data.saving) return;

    const { avatarUrl, nickName } = this.data.form;
    const trimmedName = (nickName || "").trim();

    if (!trimmedName) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    this.setData({ saving: true });

    const needsUpload =
      avatarUrl &&
      avatarUrl !== this.data.original.avatarUrl &&
      avatarUrl.indexOf("cloud://") !== 0;

    this.uploadAvatarIfNeeded(avatarUrl, needsUpload)
      .then((finalAvatarUrl) => {
        const nextUserInfo = {
          ...(wx.getStorageSync("userInfo") || {}),
          avatarUrl: finalAvatarUrl,
          nickName: trimmedName,
        };

        wx.setStorageSync("userInfo", nextUserInfo);
        const app = getApp();
        app.globalData.userInfo = nextUserInfo;

        return this.syncToCloud(nextUserInfo);
      })
      .then(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.setData) {
            prevPage.setData({ userInfo: wx.getStorageSync("userInfo") });
          }
        }

        wx.showToast({ title: "保存成功", icon: "success" });
        wx.navigateBack();
      })
      .catch((err) => {
        console.error("保存资料失败:", err);
        wx.showToast({ title: "保存失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  },

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
      .then((res) => res.fileID);
  },

  syncToCloud: function (userInfo) {
    const db = wx.cloud.database();
    const app = getApp();
    const ensureOpenid = app.globalData.openid
      ? Promise.resolve(app.globalData.openid)
      : app
          .loginWithCloud()
          .then((openid) => {
            app.globalData.openid = openid;
            wx.setStorageSync("openid", openid);
            return openid;
          });

    return ensureOpenid.then((openid) => {
      return db
        .collection("users")
        .where({ _openid: openid })
        .get()
        .then((res) => {
          if (res.data.length > 0) {
            // 更新时不能包含 _openid（系统保留字段）
            return db.collection("users").doc(res.data[0]._id).update({
              data: {
                nickName: userInfo.nickName,
                avatarUrl: userInfo.avatarUrl,
                updatedAt: db.serverDate(),
              },
            });
          }

          return db.collection("users").add({
            data: {
              nickName: userInfo.nickName,
              avatarUrl: userInfo.avatarUrl,
              updatedAt: db.serverDate(),
            },
          });
        });
    });
  },
});
