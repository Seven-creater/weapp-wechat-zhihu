// pages/mine/index.js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    userInfo: null,
    showLoginModal: false,
    pendingNavUrl: "",
  },

  onShow: function () {
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync("userInfo");
    const openid = wx.getStorageSync("openid");

    if (userInfo && openid) {
      // 有本地数据，验证云端是否还有记录
      this.validateAndSyncUser(userInfo, openid);
    } else {
      // 无本地数据，清空状态
      this.setData({ userInfo: null });
    }
  },

  // 验证并同步用户数据（确保使用云端最新资料）
  validateAndSyncUser: function (localUserInfo, openid) {
    db.collection("users")
      .where({ _openid: openid })
      .get()
      .then((res) => {
        if (res.data.length > 0) {
          const cloudUser = res.data[0];
          // 关键：用云端最新资料覆盖本地旧资料
          const latestUserInfo = {
            _id: cloudUser._id,
            nickName: cloudUser.nickName || "匿名用户",
            avatarUrl: cloudUser.avatarUrl || "/images/default-avatar.png",
            _openid: openid,
          };
          this.setData({ userInfo: latestUserInfo });
          wx.setStorageSync("userInfo", latestUserInfo);
          console.log("已同步云端用户资料");
        } else {
          // 云端记录被删除了，清空本地
          this.handleLogout(false);
        }
      })
      .catch((err) => {
        console.error("验证用户失败:", err);
        // 网络错误时保留本地数据
        this.setData({ userInfo: localUserInfo });
      });
  },

  // 处理登录（核心逻辑：优先读取云端资料）
  handleLogin: function () {
    if (this.data.userInfo) {
      // 已登录，跳转到编辑页面
      wx.navigateTo({
        url: "/pages/profile-edit/index",
      });
      return;
    }

    wx.showLoading({ title: "登录中..." });

    // 1. 调用云函数获取 OpenID
    wx.cloud.callFunction({
      name: "login",
      success: (loginRes) => {
        if (!loginRes.result || !loginRes.result.openid) {
          wx.hideLoading();
          wx.showToast({ title: "获取用户信息失败", icon: "none" });
          return;
        }

        const openid = loginRes.result.openid;

        // 保存 openid 到本地和全局
        app.globalData.openid = openid;
        wx.setStorageSync("openid", openid);

        // 2. 查询云端用户资料
        db.collection("users")
          .where({ _openid: openid })
          .get()
          .then((userRes) => {
            let userData = null;

            if (userRes.data.length > 0) {
              // 情况 A：老用户 - 使用云端最新资料
              console.log("找到云端资料，使用历史数据");
              const cloudUser = userRes.data[0];
              userData = {
                _id: cloudUser._id,
                nickName: cloudUser.nickName || "匿名用户",
                avatarUrl: cloudUser.avatarUrl || "/images/default-avatar.png",
                _openid: openid,
              };
            } else {
              // 情况 B：新用户 - 创建记录
              console.log("新用户，创建记录");
              wx.hideLoading();

              wx.showModal({
                title: "首次登录",
                content: "是否使用默认头像和昵称？您可以在个人中心修改",
                confirmText: "确定",
                cancelText: "取消",
                success: async (modalRes) => {
                  if (modalRes.confirm) {
                    wx.showLoading({ title: "创建账户..." });

                    try {
                      const addRes = await db.collection("users").add({
                        data: {
                          nickName: "新用户",
                          avatarUrl: "/images/default-avatar.png",
                          _openid: openid,
                          createTime: db.serverDate(),
                          lastLoginTime: db.serverDate(),
                          loginCount: 1,
                        },
                      });

                      userData = {
                        _id: addRes._id,
                        nickName: "新用户",
                        avatarUrl: "/images/default-avatar.png",
                        _openid: openid,
                      };

                      this.finishLogin(userData);
                    } catch (addErr) {
                      console.error("创建用户失败:", addErr);
                      wx.showToast({ title: "创建账户失败", icon: "none" });
                    }
                  }
                },
              });
              return;
            }

            this.finishLogin(userData);
          })
          .catch((err) => {
            console.error("查询用户失败:", err);
            wx.hideLoading();
            wx.showToast({ title: "登录失败，请重试", icon: "none" });
          });
      },
      fail: (err) => {
        console.error("云函数调用失败:", err);
        wx.hideLoading();
        wx.showToast({ title: "登录失败，请检查网络", icon: "none" });
      },
    });
  },

  // 完成登录（更新状态和存储）
  finishLogin: function (userData) {
    this.setData({ userInfo: userData });
    wx.setStorageSync("userInfo", userData);

    // 关闭登录模态框
    this.setData({ showLoginModal: false, pendingNavUrl: "" });

    wx.hideLoading();
    wx.showToast({ title: "登录成功", icon: "success" });

    // 如果有待处理的跳转，执行跳转
    if (this.data.pendingNavUrl) {
      wx.navigateTo({ url: this.data.pendingNavUrl });
      this.setData({ pendingNavUrl: "" });
    }
  },

  // 处理页面跳转
  handleNav: function (e) {
    const url = e.currentTarget.dataset.url;

    if (!this.data.userInfo) {
      // 未登录，显示登录提示模态框
      this.setData({
        showLoginModal: true,
        pendingNavUrl: url,
      });
      return;
    }

    // 已登录，直接跳转
    wx.navigateTo({ url: url });
  },

  // 退出登录
  handleLogout: function (showToast = true) {
    wx.showModal({
      title: "确认退出",
      content: "确定要退出登录吗？退出后将无法同步您的数据",
      confirmColor: "#ff4444",
      success: (res) => {
        if (res.confirm) {
          // 清除所有本地存储（完全退出）
          wx.removeStorageSync("userInfo");
          wx.removeStorageSync("openid");

          // 清除全局状态
          app.globalData.userInfo = null;
          app.globalData.openid = null;

          // 更新页面状态
          this.setData({
            userInfo: null,
            pendingNavUrl: "",
            showLoginModal: false,
          });

          if (showToast) {
            wx.showToast({
              title: "已退出登录",
              icon: "success",
            });
          }

          console.log("已退出登录，清除所有本地数据");
        }
      },
    });
  },

  // 隐藏登录模态框
  hideLoginModal: function () {
    this.setData({ showLoginModal: false, pendingNavUrl: "" });
  },

  // 分享功能
  onShareAppMessage: function () {
    return {
      title: "无障碍随手拍 - 让城市更友好",
      path: "/pages/index/index",
      imageUrl: "/images/share-image.png",
    };
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: "无障碍随手拍 - 共建友好城市",
      imageUrl: "/images/share-image.png",
    };
  },
});
