// pages/mine/index.js
const db = wx.cloud.database();

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
    if (userInfo) {
      this.setData({ userInfo });
      this.syncUserData();
    } else {
      this.setData({ userInfo: null });
    }
  },

  // 同步用户数据到云端
  syncUserData: function () {
    if (!this.data.userInfo) return;

    // 使用本地存储的openid，避免云函数调用
    const openid = wx.getStorageSync("openid") || "local_user_" + Date.now();

    // 如果没有openid，生成一个本地ID
    if (!wx.getStorageSync("openid")) {
      wx.setStorageSync("openid", openid);
    }

    // 更新或创建用户信息
    db.collection("users")
      .where({
        _openid: openid,
      })
      .get()
      .then((queryRes) => {
        if (queryRes.data.length === 0) {
          // 新用户，创建记录
          db.collection("users").add({
            data: {
              ...this.data.userInfo,
              _openid: openid,
              createTime: db.serverDate(),
              lastLoginTime: db.serverDate(),
              loginCount: 1,
            },
          });
        } else {
          // 老用户，更新登录信息
          db.collection("users")
            .doc(queryRes.data[0]._id)
            .update({
              data: {
                lastLoginTime: db.serverDate(),
                loginCount: db.command.inc(1),
              },
            });
        }
      })
      .catch((err) => {
        console.error("用户集合查询失败:", err);
        // 集合不存在时，创建新用户记录
        db.collection("users")
          .add({
            data: {
              ...this.data.userInfo,
              _openid: openid,
              createTime: db.serverDate(),
              lastLoginTime: db.serverDate(),
              loginCount: 1,
            },
          })
          .catch((addErr) => {
            console.error("创建用户记录失败:", addErr);
          });
      });
  },

  // 处理登录
  handleLogin: function () {
    if (this.data.userInfo) {
      return; // 已登录，不重复登录
    }

    wx.getUserProfile({
      desc: "用于完善用户资料",
      success: (res) => {
        const userInfo = res.userInfo;

        // 保存到本地存储
        wx.setStorageSync("userInfo", userInfo);

        // 更新页面数据
        this.setData({ userInfo });

        // 同步到云端
        this.syncUserData();

        // 隐藏登录模态框
        this.hideLoginModal();

        // 如果有待处理的跳转，执行跳转
        if (this.data.pendingNavUrl) {
          wx.navigateTo({
            url: this.data.pendingNavUrl,
          });
          this.setData({ pendingNavUrl: "" });
        }

        wx.showToast({
          title: "登录成功",
          icon: "success",
        });
      },
      fail: (err) => {
        console.error("登录失败:", err);
        wx.showToast({
          title: "登录失败",
          icon: "none",
        });
      },
    });
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
    wx.navigateTo({
      url: url,
    });
  },

  // 退出登录
  handleLogout: function () {
    wx.showModal({
      title: "确认退出",
      content: "确定要退出登录吗？退出后将无法同步您的数据",
      confirmColor: "#ff4444",
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync("userInfo");

          // 更新页面状态
          this.setData({
            userInfo: null,
            pendingNavUrl: "",
          });

          wx.showToast({
            title: "已退出登录",
            icon: "success",
          });
        }
      },
    });
  },

  // 隐藏登录模态框
  hideLoginModal: function () {
    this.setData({
      showLoginModal: false,
      pendingNavUrl: "",
    });
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
