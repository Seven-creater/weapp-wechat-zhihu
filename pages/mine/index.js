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

    ensureOpenid
      .then((openid) => {
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
      })
      .catch((err) => {
        console.error("获取openid失败:", err);
      });
  },

  // 处理登录（优先读取云端资料）
  handleLogin: function () {
    if (this.data.userInfo) {
      wx.navigateTo({
        url: "/pages/mine/profile-edit/index",
      });
      return;
    }

    wx.showLoading({ title: '正在同步数据...' });

    // 1. 先调用云函数 'login' 获取用户的 OpenID
    wx.cloud.callFunction({
      name: 'login',
      success: async (res) => {
        const openid = res.result.openid;
        const db = wx.cloud.database();

        try {
          // 2. 拿着 OpenID 去数据库 'users' 表里查
          const dbRes = await db.collection('users').where({
            _openid: openid
          }).get();

          let userData = null;

          if (dbRes.data.length > 0) {
            // ✅ 情况 A：老用户，数据库里有资料
            console.log('找到云端历史资料');
            userData = dbRes.data[0];
          } else {
            // 🆕 情况 B：完全的新用户，数据库里没资料
            console.log('新用户，使用默认信息');
            // 这里可以先用微信默认的，等用户去"编辑资料"页面修改
            // 或者弹窗提示用户授权获取基础信息(虽然现在只能拿到默认的)
            const profileRes = await wx.getUserProfile({ desc: '完善用户信息' });
            userData = {
              ...profileRes.userInfo,
              _openid: openid,
              createTime: db.serverDate()
            };
            // 自动帮新用户在数据库建个档
            await db.collection('users').add({ data: userData });
          }

          // 3. 更新本地状态
          this.setData({ userInfo: userData });
          wx.setStorageSync('userInfo', userData);

          // 隐藏登录模态框
          this.hideLoginModal();

          // 如果有待处理的跳转，执行跳转
          if (this.data.pendingNavUrl) {
            wx.navigateTo({
              url: this.data.pendingNavUrl,
            });
            this.setData({ pendingNavUrl: "" });
          }

          wx.hideLoading();
          wx.showToast({ title: '登录成功' });

        } catch (err) {
          console.error('登录流程出错', err);
          wx.hideLoading();
          wx.showToast({ title: '同步失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('云函数调用失败', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
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
