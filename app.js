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

      // 立即触发登录成功事件，确保页面及时更新
      this.triggerLoginSuccess(userInfo, openid);

      // 异步同步本地资料为云端最新资料（仅头像/昵称）
      this.syncUserInfoFromCloud(openid, userInfo);
      return;
    }

    if (userInfo && !openid) {
      this.loginWithCloud()
        .then((openidFromCloud) => {
          this.globalData.userInfo = userInfo;
          this.globalData.openid = openidFromCloud;
          wx.setStorageSync("openid", openidFromCloud);
          // 触发登录成功事件
          this.triggerLoginSuccess(userInfo, openidFromCloud);
          // 同步用户信息到云端
          this.syncUserInfoToCloud(openidFromCloud, userInfo);
        })
        .catch((err) => {
          console.error("获取openid失败:", err);
        });
    }
  },

  // 从云端同步用户信息
  syncUserInfoFromCloud: function (openid, localUserInfo) {
    const db = wx.cloud.database();
    db.collection("users")
      .where({ _openid: openid })
      .limit(1)
      .get()
      .then((res) => {
        const doc = res.data && res.data[0];
        if (doc) {
          const latest = {
            avatarUrl:
              doc.avatarUrl ||
              (doc.userInfo && doc.userInfo.avatarUrl) ||
              localUserInfo.avatarUrl,
            nickName:
              doc.nickName ||
              (doc.userInfo && doc.userInfo.nickName) ||
              localUserInfo.nickName,
          };

          // 只有当云端数据与本地数据不同时才更新
          if (
            latest.avatarUrl !== localUserInfo.avatarUrl ||
            latest.nickName !== localUserInfo.nickName
          ) {
            const merged = { ...localUserInfo, ...latest };
            this.globalData.userInfo = merged;
            wx.setStorageSync("userInfo", merged);
            // 通知页面用户信息已更新
            this.triggerLoginSuccess(merged, openid);
          }
        }
      })
      .catch(() => {});
  },

  // 同步用户信息到云端
  syncUserInfoToCloud: function (openid, userInfo) {
    const db = wx.cloud.database();
    const baseData = {
      nickName: userInfo.nickName || "匿名用户",
      avatarUrl: userInfo.avatarUrl || "/images/zhi.png",
      userInfo: userInfo,
    };

    db.collection("users")
      .where({ _openid: openid })
      .get()
      .then((res) => {
        if (res.data.length === 0) {
          // 新用户
          db.collection("users").add({
            data: {
              ...baseData,
              _openid: openid,
              createTime: db.serverDate(),
              updatedAt: db.serverDate(),
              loginCount: 1,
              lastLoginTime: db.serverDate(),
            },
          });
        } else {
          // 更新现有用户
          db.collection("users")
            .doc(res.data[0]._id)
            .update({
              data: {
                nickName: baseData.nickName,
                avatarUrl: baseData.avatarUrl,
                userInfo: baseData.userInfo,
                updatedAt: db.serverDate(),
                lastLoginTime: db.serverDate(),
                loginCount: db.command.inc(1),
              },
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
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
                  const baseData = {
                    _openid: openid,
                    nickName: userInfo.nickName || "匿名用户",
                    avatarUrl: userInfo.avatarUrl || "/images/zhi.png",
                    userInfo: userInfo,
                  };
                  if (res.data.length === 0) {
                    // 新用户，插入数据（顶层字段 + 备份 userInfo）
                    db.collection("users").add({
                      data: {
                        ...baseData,
                        createTime: db.serverDate(),
                        updatedAt: db.serverDate(),
                        loginCount: 1,
                        lastLoginTime: db.serverDate(),
                      },
                    });
                  } else {
                    // 已存在，写入最新头像/昵称
                    db.collection("users")
                      .doc(res.data[0]._id)
                      .update({
                        data: {
                          nickName: baseData.nickName,
                          avatarUrl: baseData.avatarUrl,
                          userInfo: baseData.userInfo,
                          updatedAt: db.serverDate(),
                          lastLoginTime: db.serverDate(),
                          loginCount: db.command.inc(1),
                        },
                      })
                      .catch(() => {});
                  }

                  // 触发全局登录成功事件
                  that.triggerLoginSuccess(userInfo, openid);
                })
                .catch((err) => {
                  console.error("用户数据保存失败:", err);
                  // 即使数据库保存失败，也不影响登录
                  that.triggerLoginSuccess(userInfo, openid);
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

  // 触发登录成功事件，通知所有页面更新用户信息
  triggerLoginSuccess: function (userInfo, openid) {
    const pages = getCurrentPages();
    pages.forEach((page) => {
      if (page.onLoginSuccess && typeof page.onLoginSuccess === "function") {
        page.onLoginSuccess(userInfo, openid);
      }
    });
  },
});
