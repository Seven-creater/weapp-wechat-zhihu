# 自动登录功能说明

## 功能描述
用户退出登录后，再次进入登录页面时，会自动检测该 openid 是否已注册过。如果已注册，则自动登录，无需重新填写资料。

## 工作流程

### 首次注册
1. 用户打开小程序 → 进入登录页
2. 填写资料（头像、昵称、手机号、身份、简介）
3. 提交注册 → 保存到数据库
4. 登录成功

### 退出登录
1. 用户点击"退出登录"
2. **只清除 openid**（登录凭证）
3. **保留所有用户信息**在数据库中

### 再次登录（自动登录）
1. 用户打开小程序 → 进入登录页
2. 自动获取 openid
3. 从数据库查询该 openid 的用户信息
4. 如果找到完整信息（昵称 + 手机号）→ **自动登录**
5. 如果未找到 → 显示注册表单

## 保留的信息

✅ **自动恢复的信息**：
- 头像（avatarUrl）
- 昵称（nickName）
- 手机号（phoneNumber）
- 用户身份（userType）
- 身份徽章（badge）
- 个人简介（profile.bio）
- 政府认证信息（profile.department, position, workId）

## 代码实现

### 1. 登录页面自动登录（pages/login/index.js）

```javascript
onLoad: function (options) {
  // 加载用户类型列表
  const userTypes = getAllTypes();
  this.setData({ userTypes });
  
  // 🔧 尝试自动登录
  this.tryAutoLogin();
}

tryAutoLogin: function () {
  wx.showLoading({ title: '登录中...' });
  
  // 1. 获取 openid
  this.getOpenid()
    .then((openid) => {
      // 2. 查询数据库
      return wx.cloud.callFunction({
        name: 'getUserInfo',
        data: { targetId: openid }
      });
    })
    .then((res) => {
      if (res.result.success && res.result.data) {
        const userData = res.result.data;
        
        // 3. 检查是否已注册（有昵称和手机号）
        if (userData.userInfo.nickName && userData.phoneNumber) {
          // ✅ 自动登录
          const fullUserInfo = {
            nickName: userData.userInfo.nickName,
            avatarUrl: userData.userInfo.avatarUrl,
            userType: userData.userType,
            badge: userData.badge,
            profile: userData.profile
          };
          
          app.globalData.userInfo = fullUserInfo;
          app.globalData.hasLogin = true;
          wx.setStorageSync('userInfo', fullUserInfo);
          
          // 跳转到"我的"页面
          wx.switchTab({ url: '/pages/mine/index' });
        } else {
          // ❌ 未注册，显示表单
          this.showRegistrationForm();
        }
      }
    });
}
```

### 2. 退出登录逻辑（pages/mine/index.js）

```javascript
handleLogout: function () {
  wx.showModal({
    title: '提示',
    content: '确定要退出登录吗？下次登录将自动恢复您的资料。',
    success: (res) => {
      if (res.confirm) {
        // 🔧 只清除 openid，保留用户信息
        wx.removeStorageSync('openid');
        app.globalData.openid = null;
        app.globalData.hasLogin = false;
        
        // ✅ 不删除 userInfo，数据保留在数据库中
      }
    }
  });
}
```

## 用户体验

### 之前 ❌
1. 退出登录
2. 再次登录 → 需要重新填写所有资料
3. 用户体验差

### 现在 ✅
1. 退出登录
2. 再次登录 → **自动识别并登录**
3. 无需填写任何资料
4. 用户体验极佳

## 安全性

- ✅ openid 是微信官方提供的唯一标识，安全可靠
- ✅ 手机号等敏感信息只存储在数据库，不存储在本地
- ✅ 每次登录都会重新验证 openid
- ✅ 用户可以随时修改资料

## 测试步骤

1. **首次注册**：
   - 打开小程序
   - 填写完整资料
   - 提交注册
   - 验证登录成功

2. **退出登录**：
   - 进入"我的"页面
   - 点击"退出登录"
   - 验证退出成功

3. **自动登录**：
   - 重新打开小程序
   - 应该自动登录，无需填写资料
   - 验证所有信息（头像、昵称、身份、简介）都已恢复

4. **新用户注册**：
   - 使用新的微信账号
   - 应该显示注册表单
   - 填写资料后注册成功

