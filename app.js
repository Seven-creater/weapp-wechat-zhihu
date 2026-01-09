//app.js
App({
  onLaunch: function () {
    // 初始化云开发环境
    wx.cloud.init({
      env: "cloud1-8g7mscenc95268ca", // 使用用户提供的云开发环境ID
      traceUser: true, // 开启用户访问记录
    });

    // 检查本地存储，恢复登录状态
    this.checkLocalLogin();
  },

  // 检查本地存储，恢复登录状态
  checkLocalLogin: function () {
    const userInfo = wx.getStorageSync("userInfo");
    const openid = wx.getStorageSync("openid");

    if (userInfo && openid) {
      // 恢复全局登录状态
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      return;
    }

    if (userInfo && !openid) {
      this.loginWithCloud()
        .then((openidFromCloud) => {
          this.globalData.userInfo = userInfo;
          this.globalData.openid = openidFromCloud;
          wx.setStorageSync("openid", openidFromCloud);
        })
        .catch((err) => {
          console.error("获取openid失败:", err);
        });
    }
  },

  globalData: {
    userInfo: null, // 用户信息，默认未登录
    openid: null, // 用户OpenID
  },

  // 全局登录检查函数
  checkLogin: function () {
    const that = this;
    return new Promise((resolve, reject) => {
      // 检查全局用户信息
      if (that.globalData.userInfo && that.globalData.openid) {
        resolve(true);
      } else {
        // 检查本地存储
        const userInfo = wx.getStorageSync("userInfo");
        const openid = wx.getStorageSync("openid");
        if (userInfo && openid) {
          // 恢复全局状态
          that.globalData.userInfo = userInfo;
          that.globalData.openid = openid;
          resolve(true);
        } else {
          reject(false);
        }
      }
    });
  },

  // 云函数获取openid
  loginWithCloud: function () {
    return wx.cloud
      .callFunction({
        name: "login",
      })
      .then((res) => {
        const openid = res?.result?.openid;
        if (!openid) {
          throw new Error("云函数未返回openid");
        }
        return openid;
      });
  },

  // 全局登录函数
  login: function () {
    const that = this;
    return new Promise((resolve, reject) => {
      // 先获取用户信息
      wx.getUserProfile({
        desc: "用于完善用户资料",
        success: (res) => {
          const userInfo = res.userInfo;

          that
            .loginWithCloud()
            .then((openid) => {
              // 存储到全局
              that.globalData.userInfo = userInfo;
              that.globalData.openid = openid;

              // 存储到本地
              wx.setStorageSync("userInfo", userInfo);
              wx.setStorageSync("openid", openid);

              // 保存到云数据库users集合
              const db = wx.cloud.database();
              db.collection("users")
                .where({
                  _openid: openid,
                })
                .get()
                .then((res) => {
                  if (res.data.length === 0) {
                    // 新用户，插入数据
                    db.collection("users").add({
                      data: {
                        userInfo: userInfo,
                        _openid: openid,
                        createTime: db.serverDate(),
                      },
                    });
                  }
                })
                .catch((err) => {
                  console.error("用户数据保存失败:", err);
                  // 即使数据库保存失败，也不影响登录
                });

              resolve({ userInfo, openid });
            })
            .catch((err) => {
              console.error("获取openid失败:", err);
              reject(err);
            });
        },
        fail: (err) => {
          console.error("用户拒绝授权:", err);
          reject(err);
        },
      });
    });
  },
});
