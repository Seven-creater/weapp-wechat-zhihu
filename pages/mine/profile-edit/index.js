const app = getApp();

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

  chooseAvatar: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const tempFile = res && res.tempFiles && res.tempFiles[0];
        const tempFilePath = tempFile && tempFile.tempFilePath;
        if (!tempFilePath) return;

        this.setData({
          form: {
            ...this.data.form,
            avatarUrl: tempFilePath,
          },
        });
      },
      fail: () => {
        wx.showToast({ title: "选择头像失败", icon: "none" });
      },
    });
  },

  onChooseAvatar: function (e) {
    const avatarUrl = e && e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({
      form: {
        ...this.data.form,
        avatarUrl,
      },
    });
  },

  onNameInput: function (e) {
    const value = (e && e.detail && e.detail.value) || "";
    this.setData({
      form: {
        ...this.data.form,
        nickName: value,
      },
    });
  },

  onNameBlur: function (e) {
    const value = (e && e.detail && e.detail.value) || "";
    if (!value) return;
    this.setData({
      form: {
        ...this.data.form,
        nickName: value,
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

    const isLocalTempFile = /^wxfile:|^https?:\/\/tmp\//.test(avatarUrl || "");
    const needsUpload =
      avatarUrl &&
      isLocalTempFile &&
      avatarUrl !== this.data.original.avatarUrl &&
      avatarUrl.indexOf("cloud://") !== 0 &&
      !avatarUrl.startsWith("https://thirdwx.qlogo.cn");

    this.uploadAvatarIfNeeded(avatarUrl, needsUpload)
      .then((finalAvatarUrl) => {
        const nextUserInfo = {
          ...(wx.getStorageSync("userInfo") || {}),
          avatarUrl: finalAvatarUrl || "",
          nickName: trimmedName,
        };

        return app.ensureOpenid().then((openid) => {
          const applied = app.applyUserState(nextUserInfo, openid);

          this.setData({
            form: {
              ...this.data.form,
              avatarUrl: applied.avatarUrl,
              nickName: applied.nickName,
            },
            original: {
              avatarUrl: applied.avatarUrl,
              nickName: applied.nickName,
            },
          });

          const pages = getCurrentPages();
          if (pages.length > 1) {
            const prevPage = pages[pages.length - 2];
            if (prevPage && prevPage.setData) {
              prevPage.setData({ userInfo: applied });
            }
          }

          return app.upsertUserProfile(openid, applied);
        });
      })
      .then(() => {
        wx.showToast({ title: "保存成功", icon: "success" });
      })
      .catch((error) => {
        console.error("保存失败:", error);
        wx.showToast({
          title: (error && error.message) || "保存失败",
          icon: "none",
        });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  },

  uploadAvatarIfNeeded: function (avatarUrl, needsUpload) {
    if (!needsUpload) {
      return Promise.resolve(avatarUrl);
    }

    if (!avatarUrl) {
      return Promise.resolve("");
    }

    return app.uploadFile({ filePath: avatarUrl, dir: "avatars" });
  },
});
