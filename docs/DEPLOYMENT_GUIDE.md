# 完整部署和测试指南

## 📦 部署清单

### 一、云函数部署

#### 1. updateUserStats（用户统计更新）
```bash
cd cloudfunctions/updateUserStats
npm install
# 右键 -> 上传并部署：云端安装依赖
```

**测试方法：**
```javascript
wx.cloud.callFunction({
  name: 'updateUserStats',
  data: {
    action: 'follow',
    followerId: 'test_openid_1',
    targetId: 'test_openid_2'
  }
}).then(res => {
  console.log('测试结果:', res);
});
```

#### 2. updateConversation（会话管理）
```bash
cd cloudfunctions/updateConversation
npm install
# 右键 -> 上传并部署：云端安装依赖
```

**测试方法：**
```javascript
wx.cloud.callFunction({
  name: 'updateConversation',
  data: {
    action: 'send',
    targetId: 'test_openid',
    lastMessage: '测试消息',
    targetUserInfo: {
      nickName: '测试用户',
      avatarUrl: '/images/zhi.png'
    }
  }
}).then(res => {
  console.log('测试结果:', res);
});
```

#### 3. updateUserInfo（用户信息更新）
```bash
cd cloudfunctions/updateUserInfo
npm install
# 右键 -> 上传并部署：云端安装依赖
```

**测试方法：**
登录页面会自动调用

#### 4. migrateUserData（数据迁移工具）
```bash
cd cloudfunctions/migrateUserData
npm install
# 右键 -> 上传并部署：云端安装依赖
```

**使用方法：**
```javascript
// 1. 检查数据结构
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'check' }
}).then(res => {
  console.log('检查报告:', res.result.report);
});

// 2. 迁移所有数据
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'migrate' }
}).then(res => {
  console.log('迁移结果:', res.result);
});

// 3. 修复单个用户
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { 
    action: 'fix',
    openid: 'user_openid'
  }
}).then(res => {
  console.log('修复结果:', res.result);
});
```

---

### 二、数据库配置

#### 1. 创建 conversations 集合

**权限设置：**
```json
{
  "read": "doc.ownerId == auth.openid",
  "write": "doc.ownerId == auth.openid"
}
```

**索引设置：**
- `ownerId` + `updateTime` (降序)

#### 2. 检查 users 集合权限

**权限设置：**
```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

**索引设置：**
- `_openid` (唯一索引)

#### 3. 检查 follows 集合权限

**权限设置：**
```json
{
  "read": true,
  "write": "doc.followerId == auth.openid"
}
```

**索引设置：**
- `followerId` + `createTime` (降序)
- `targetId` + `createTime` (降序)
- `followerId` + `targetId` (复合索引)

#### 4. 检查 messages 集合权限

**权限设置：**
```json
{
  "read": "doc.senderId == auth.openid || doc.receiverId == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

**索引设置：**
- `roomId` + `createTime` (升序)

---

## 🔧 数据修复流程

### 方案一：自动迁移（推荐）

1. **部署迁移工具**
```bash
cd cloudfunctions/migrateUserData
npm install
# 上传并部署
```

2. **检查数据状态**
在小程序中执行：
```javascript
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'check' }
}).then(res => {
  console.log('需要修复的用户数:', res.result.report.needFix);
  console.log('详细问题:', res.result.report.issues);
});
```

3. **执行迁移**
```javascript
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'migrate' }
}).then(res => {
  console.log('修复成功:', res.result.fixed);
  console.log('修复失败:', res.result.failed);
});
```

### 方案二：让用户重新登录

1. 清除所有用户的登录状态
2. 用户重新登录时会自动创建正确的数据结构

### 方案三：手动修复

在云开发控制台的数据库中：
1. 打开 `users` 集合
2. 找到有问题的记录
3. 手动编辑，确保结构正确

---

## ✅ 测试清单

### 1. 登录功能测试

- [ ] 新用户注册
  - [ ] 选择头像
  - [ ] 输入昵称
  - [ ] 输入手机号（11位）
  - [ ] 提交成功
  - [ ] 数据库中创建正确的记录

- [ ] 老用户登录
  - [ ] 显示已有的头像和昵称
  - [ ] 可以修改信息
  - [ ] 更新成功

### 2. 用户主页测试

- [ ] 查看自己的主页
  - [ ] 显示正确的头像和昵称
  - [ ] 显示统计数据（关注、粉丝、获赞）
  - [ ] 显示发布的内容

- [ ] 查看别人的主页
  - [ ] 显示对方的头像和昵称（不是自己的）
  - [ ] 显示对方的统计数据
  - [ ] 显示关注按钮状态
  - [ ] 可以点击私信

### 3. 关注功能测试

- [ ] 关注用户
  - [ ] 点击"关注"按钮
  - [ ] 按钮变为"已关注"
  - [ ] 关注数和粉丝数更新
  - [ ] 对方收到通知（如果实现了）

- [ ] 取消关注
  - [ ] 点击"已关注"按钮
  - [ ] 按钮变为"关注"
  - [ ] 关注数和粉丝数更新

- [ ] 互相关注
  - [ ] A关注B，B关注A
  - [ ] 双方都显示"互相关注"
  - [ ] 按钮显示紫色渐变

### 4. 关注列表测试

- [ ] 关注列表
  - [ ] 显示所有关注的用户
  - [ ] 每个用户显示头像和昵称
  - [ ] 互相关注的显示标签
  - [ ] 可以取消关注

- [ ] 粉丝列表
  - [ ] 显示所有粉丝
  - [ ] 每个用户显示头像和昵称
  - [ ] 显示关注状态
  - [ ] 可以回关

### 5. 私信功能测试

- [ ] 发送消息
  - [ ] 输入消息内容
  - [ ] 点击发送
  - [ ] 消息显示在聊天界面
  - [ ] 会话列表自动更新

- [ ] 接收消息
  - [ ] 实时收到新消息
  - [ ] 显示未读红点
  - [ ] 打开聊天后红点消失

- [ ] 会话列表
  - [ ] 显示所有会话
  - [ ] 显示最后一条消息
  - [ ] 显示未读数量
  - [ ] 按时间排序

---

## 🐛 常见问题排查

### 问题1：关注列表没有头像和昵称

**排查步骤：**
1. 打开控制台，查看日志
2. 检查是否有 "查询到的用户信息" 日志
3. 检查 userInfo 对象是否存在

**解决方法：**
```javascript
// 在控制台执行数据迁移
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'migrate' }
});
```

### 问题2：用户主页显示错误的信息

**排查步骤：**
1. 查看控制台日志中的 "目标用户ID"
2. 检查是否传递了正确的 openid
3. 检查数据库查询结果

**解决方法：**
- 确保 `navigateTo` 时传递了正确的 `id` 参数
- 检查 `field()` 方法是否正确指定字段

### 问题3：互相关注不显示

**排查步骤：**
1. 检查 follows 集合中的 `isMutual` 字段
2. 查看云函数 updateUserStats 是否正常执行

**解决方法：**
```javascript
// 重新关注一次，触发互关检测
// 或手动更新数据库
```

### 问题4：会话列表不更新

**排查步骤：**
1. 检查 conversations 集合是否存在
2. 检查云函数 updateConversation 是否部署
3. 查看发送消息时的日志

**解决方法：**
- 创建 conversations 集合
- 重新部署 updateConversation 云函数

---

## 📊 数据库检查工具

### 在云开发控制台执行

```javascript
// 检查 users 集合结构
db.collection('users').limit(10).get().then(res => {
  res.data.forEach(user => {
    console.log('用户:', user._openid);
    console.log('  userInfo:', user.userInfo);
    console.log('  stats:', user.stats);
    console.log('  冗余字段:', {
      nickName: user.nickName,
      avatarUrl: user.avatarUrl
    });
  });
});

// 检查 follows 集合
db.collection('follows').limit(10).get().then(res => {
  res.data.forEach(follow => {
    console.log('关注关系:', {
      follower: follow.followerId,
      target: follow.targetId,
      mutual: follow.isMutual
    });
  });
});

// 检查 conversations 集合
db.collection('conversations').limit(10).get().then(res => {
  console.log('会话数量:', res.data.length);
  res.data.forEach(conv => {
    console.log('会话:', {
      owner: conv.ownerId,
      target: conv.targetId,
      unread: conv.unread
    });
  });
});
```

---

## 📝 部署检查表

### 云函数部署
- [ ] updateUserStats 已部署
- [ ] updateConversation 已部署
- [ ] updateUserInfo 已部署
- [ ] migrateUserData 已部署
- [ ] login 已部署（原有）
- [ ] getPublicData 已部署（原有）

### 数据库配置
- [ ] users 集合权限正确
- [ ] follows 集合权限正确
- [ ] messages 集合权限正确
- [ ] conversations 集合已创建
- [ ] 所有索引已创建

### 数据修复
- [ ] 执行数据检查
- [ ] 执行数据迁移
- [ ] 验证数据结构

### 功能测试
- [ ] 登录功能正常
- [ ] 用户主页正常
- [ ] 关注功能正常
- [ ] 私信功能正常
- [ ] 会话列表正常

---

## 🎯 下一步优化建议

### 1. 性能优化
- [ ] 添加数据缓存
- [ ] 实现图片懒加载
- [ ] 优化数据库查询
- [ ] 添加分页加载

### 2. 功能增强
- [ ] 消息撤回（2分钟内）
- [ ] 发送图片消息
- [ ] 消息已读状态
- [ ] 会话置顶功能
- [ ] 消息免打扰

### 3. 通知系统
- [ ] 创建 notifications 集合
- [ ] 实现关注通知
- [ ] 实现点赞通知
- [ ] 实现评论通知
- [ ] 实现@提醒

### 4. UI优化
- [ ] 添加加载动画
- [ ] 添加骨架屏
- [ ] 优化按钮动画
- [ ] 添加下拉刷新
- [ ] 添加上拉加载

---

## 📞 技术支持

如遇到问题，请提供以下信息：
1. 控制台完整日志
2. 数据库截图
3. 具体的操作步骤
4. 期望的结果 vs 实际结果

相关文档：
- [优化总结](./OPTIMIZATION_SUMMARY.md)
- [用户信息修复](./USER_INFO_FIX.md)
- [系统设计](./SOCIAL_SYSTEM_DESIGN.md)
- [数据库操作](./SOCIAL_SYSTEM_DATABASE.md)
- [云函数实现](./SOCIAL_SYSTEM_CLOUDFUNCTIONS.md)

