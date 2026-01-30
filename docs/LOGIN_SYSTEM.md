# 無界营造 - 登录/退出登录系统说明

## 系统概述

本系统实现了完整的用户登录/退出登录功能，使用微信官方推荐的方式（`chooseAvatar` + `type="nickname"`）来获取用户头像和昵称。

## 核心功能

### 1. 登录流程

**页面：** `pages/login/index`

**流程：**
1. 用户点击"我的"页面的"点击登录"区域
2. 跳转到登录页面
3. 用户选择头像（使用 `open-type="chooseAvatar"`）
4. 用户输入昵称（使用 `type="nickname"`）
5. 点击"完成"按钮
6. 系统执行以下步骤：
   - 调用 `login` 云函数获取 `openid`
   - 上传头像到云存储（如果是临时文件）
   - 调用 `updateUserInfo` 云函数保存用户信息到数据库
   - 更新全局状态和本地缓存
   - 返回"我的"页面

**关键代码：**
```javascript
// 获取 openid
wx.cloud.callFunction({
  name: 'login',
  data: {},
})

// 上传头像
wx.cloud.uploadFile({
  cloudPath: `avatars/${Date.now()}-${random}.jpg`,
  filePath: tempFilePath,
})

// 保存用户信息
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: { nickName, avatarUrl },
})
```

### 2. 退出登录流程

**页面：** `pages/mine/index`

**流程：**
1. 用户点击"退出登录"按钮
2. 弹出确认对话框
3. 确认后执行：
   - 清除 `openid`（从 storage 和 globalData）
   - **保留** `userInfo`（头像和昵称）
   - 清空页面显示（posts、stats 等）
   - 显示未登录状态

**关键代码：**
```javascript
handleLogout: function () {
  // 清除登录状态
  wx.removeStorageSync('openid');
  app.globalData.openid = null;
  app.globalData.hasLogin = false;
  
  // 注意：保留 userInfo，这样重新登录时可以恢复
  // wx.removeStorageSync('userInfo'); // 不执行这行
  
  // 清空页面显示
  this.setData({
    isLoggedIn: false,
    userInfo: {},
    posts: [],
    stats: { following: 0, followers: 0, likes: 0 },
  });
}
```

### 3. 编辑资料流程

**页面：** `pages/edit-profile/index`

**流程：**
1. 已登录用户点击头像
2. 跳转到编辑资料页面
3. 用户可以更换头像和昵称
4. 点击"保存"按钮
5. 系统执行：
   - 上传新头像到云存储
   - 调用 `updateUserInfo` 云函数更新数据库
   - 更新全局状态和本地缓存
   - 返回"我的"页面

## 数据存储

### 本地存储（Storage）
- `openid`: 用户的微信 openid（登录凭证）
- `userInfo`: 用户信息对象 `{ nickName, avatarUrl }`

### 全局状态（GlobalData）
- `app.globalData.openid`: 当前用户的 openid
- `app.globalData.userInfo`: 当前用户信息
- `app.globalData.hasLogin`: 是否已登录

### 云数据库
- 集合：`users`
- 字段：
  - `_openid`: 自动添加的用户 openid
  - `nickName`: 用户昵称
  - `avatarUrl`: 用户头像（云存储地址）
  - `createTime`: 创建时间
  - `updateTime`: 更新时间

## 云函数

### 1. login
**功能：** 获取用户的 openid

**输入：** 无

**输出：**
```javascript
{
  openid: 'xxx',
  appid: 'xxx',
  unionid: 'xxx'
}
```

### 2. updateUserInfo
**功能：** 保存/更新用户信息到数据库

**输入：**
```javascript
{
  nickName: '用户昵称',
  avatarUrl: 'cloud://xxx'
}
```

**输出：**
```javascript
{
  success: true,
  data: { ... }
}
```

## 页面状态管理

### "我的"页面（pages/mine/index）

**未登录状态：**
- 显示"点击登录"提示卡片
- 不显示统计数据（关注、粉丝、获赞）
- 不显示内容标签页（笔记、收藏、赞过）
- 不显示内容列表

**已登录状态：**
- 显示用户头像和昵称
- 显示"退出登录"按钮
- 显示统计数据
- 显示内容标签页
- 显示内容列表

**状态判断：**
```javascript
checkLoginStatus: function () {
  const openid = app.globalData.openid || wx.getStorageSync('openid');
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  
  if (openid && userInfo) {
    // 已登录
    this.setData({ isLoggedIn: true, userInfo });
    this.loadStats();
    this.loadPosts(true);
  } else {
    // 未登录
    this.setData({ isLoggedIn: false, userInfo: {}, posts: [], stats: {} });
  }
}
```

## 重要设计决策

### 1. 为什么退出登录时保留 userInfo？

**原因：**
- 用户重新登录时可以直接使用之前的头像和昵称
- 避免用户每次登录都要重新设置
- 符合用户预期（退出登录不等于删除账号）

**实现：**
```javascript
// 退出登录时只清除 openid
wx.removeStorageSync('openid');

// 不清除 userInfo
// wx.removeStorageSync('userInfo'); // 注释掉
```

### 2. 为什么分离"查看资料"和"编辑资料"？

**原因：**
- 符合用户习惯（大多数应用都是这样设计）
- 避免误操作（不会不小心改了昵称）
- 更清晰的交互流程

**实现：**
- "我的"页面：只显示信息，点击头像跳转到编辑页面
- "编辑资料"页面：专门用于修改头像和昵称

### 3. 为什么使用微信官方推荐的方式？

**原因：**
- 微信已废弃 `getUserInfo` 和 `getUserProfile` 接口
- 官方推荐使用 `chooseAvatar` + `type="nickname"` 组件
- 符合最新的隐私保护规范

**实现：**
```xml
<!-- 头像选择 -->
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image src="{{avatarUrl}}" />
</button>

<!-- 昵称输入 -->
<input type="nickname" bindinput="onNicknameInput" />
```

## 测试清单

- [ ] 首次登录流程
  - [ ] 选择头像
  - [ ] 输入昵称
  - [ ] 保存成功
  - [ ] 跳转到"我的"页面

- [ ] 退出登录流程
  - [ ] 点击"退出登录"按钮
  - [ ] 确认对话框
  - [ ] 页面清空
  - [ ] 显示未登录状态

- [ ] 重新登录流程
  - [ ] 点击"点击登录"
  - [ ] 自动填充之前的头像和昵称
  - [ ] 可以修改或直接保存
  - [ ] 登录成功

- [ ] 编辑资料流程
  - [ ] 点击头像
  - [ ] 跳转到编辑页面
  - [ ] 更换头像
  - [ ] 修改昵称
  - [ ] 保存成功
  - [ ] 返回"我的"页面

- [ ] 数据持久化
  - [ ] 关闭小程序
  - [ ] 重新打开
  - [ ] 登录状态保持
  - [ ] 用户信息正确显示

## 文件清单

### 页面文件
- `pages/login/index.js` - 登录页面逻辑
- `pages/login/index.wxml` - 登录页面结构
- `pages/login/index.wxss` - 登录页面样式
- `pages/login/index.json` - 登录页面配置

- `pages/mine/index.js` - "我的"页面逻辑
- `pages/mine/index.wxml` - "我的"页面结构
- `pages/mine/index.wxss` - "我的"页面样式
- `pages/mine/index.json` - "我的"页面配置

- `pages/edit-profile/index.js` - 编辑资料页面逻辑
- `pages/edit-profile/index.wxml` - 编辑资料页面结构
- `pages/edit-profile/index.wxss` - 编辑资料页面样式
- `pages/edit-profile/index.json` - 编辑资料页面配置

### 云函数
- `cloudfunctions/login/index.js` - 获取 openid
- `cloudfunctions/updateUserInfo/index.js` - 保存用户信息

### 应用文件
- `app.js` - 全局应用逻辑（包含登录相关方法）
- `app.json` - 应用配置（包含页面路由）

## 下一步工作

1. **部署云函数**
   - 上传 `login` 云函数
   - 上传 `updateUserInfo` 云函数

2. **创建数据库集合**
   - 创建 `users` 集合
   - 设置权限规则

3. **测试完整流程**
   - 在开发者工具中测试
   - 在真机上测试

4. **优化用户体验**
   - 添加加载动画
   - 优化错误提示
   - 添加网络异常处理

## 常见问题

### Q: 为什么退出登录后还能看到头像和昵称？
A: 这是设计决策。退出登录只清除登录凭证（openid），保留用户信息，方便下次登录。

### Q: 如何完全清除用户数据？
A: 在退出登录时取消注释以下代码：
```javascript
wx.removeStorageSync('userInfo');
app.globalData.userInfo = null;
```

### Q: 头像上传失败怎么办？
A: 系统会自动使用临时路径或默认头像，不会阻塞登录流程。

### Q: 如何修改默认头像？
A: 修改 `/images/zhi.png` 文件，或在代码中修改默认头像路径。

---

**创建时间：** 2026-01-30
**版本：** 1.0
**作者：** 無界营造开发团队








