# 关注/粉丝与私信功能说明

## 功能概述

本文档说明了"無界营造"小程序中的关注/粉丝列表和私信功能的实现。

## 功能流程

### 1. 查看关注/粉丝列表

#### 入口
- 在"我的"页面（`pages/mine/index`）点击"关注"或"粉丝"统计项

#### 页面：`pages/follow-list/index`

**功能特性：**
- 显示关注的用户列表或粉丝列表
- 每个用户显示：头像、昵称
- 显示关注状态按钮（"关注" / "已关注"）
- 点击用户可以查看其主页
- 可以直接在列表中关注/取消关注用户

**登录检查：**
- 未登录时会提示"请先登录"，并提供"去登录"按钮

### 2. 查看用户主页

#### 入口
- 从关注/粉丝列表点击用户
- 从帖子详情页点击用户头像/昵称

#### 页面：`pages/user-profile/index`

**功能特性：**
- 显示用户基本信息：头像、昵称、简介
- 显示用户统计：关注数、粉丝数、获赞数
- 显示关注状态和操作按钮：
  - "关注" / "已关注" 按钮
  - "私信" 按钮
- 显示用户发布的内容（动态、收藏、赞过）
- 支持切换标签页查看不同类型的内容

**登录检查：**
- 未登录时点击"关注"或"私信"会提示登录

### 3. 发起私信

#### 入口
- 在用户主页点击"私信"按钮

#### 页面：`pages/chat/chat`

**功能特性：**
- 实时聊天功能（使用云数据库实时监听）
- 显示聊天历史记录
- 发送文字消息
- 自动滚动到最新消息
- 显示对方昵称和头像

**登录检查：**
- 未登录时会提示"请先登录后再发起私信"，并提供"去登录"按钮
- 不能私信自己

## 数据库结构

### 1. `users` 集合
存储用户信息：
```javascript
{
  _id: "记录ID",
  _openid: "用户openid",
  userInfo: {
    nickName: "用户昵称",
    avatarUrl: "头像URL"
  },
  createTime: "创建时间",
  updateTime: "更新时间"
}
```

### 2. `follows` 集合
存储关注关系：
```javascript
{
  _id: "记录ID",
  followerId: "关注者openid",
  targetId: "被关注者openid",
  createTime: "关注时间"
}
```

### 3. `messages` 集合
存储聊天消息：
```javascript
{
  _id: "消息ID",
  _openid: "发送者openid",
  content: "消息内容",
  roomId: "聊天室ID（两个用户openid排序后用_连接）",
  senderId: "发送者openid",
  receiverId: "接收者openid",
  userInfo: {
    nickName: "发送者昵称",
    avatarUrl: "发送者头像"
  },
  createTime: "发送时间"
}
```

## 关键实现细节

### 1. 关注/取消关注

**关注：**
```javascript
db.collection('follows').add({
  data: {
    followerId: myOpenid,
    targetId: targetOpenid,
    createTime: db.serverDate()
  }
})
```

**取消关注：**
```javascript
db.collection('follows').where({
  followerId: myOpenid,
  targetId: targetOpenid
}).remove()
```

### 2. 检查关注状态

```javascript
db.collection('follows').where({
  followerId: myOpenid,
  targetId: targetOpenid
}).get().then(res => {
  const isFollowing = res.data.length > 0;
})
```

### 3. 聊天室ID生成

为了确保两个用户之间只有一个聊天室，使用排序后的openid组合：

```javascript
const roomId = [myOpenid, targetOpenid].sort().join('_');
```

### 4. 实时消息监听

使用云数据库的 `watch` API 实现实时消息推送：

```javascript
db.collection('messages')
  .where({ roomId: roomId })
  .orderBy('createTime', 'asc')
  .watch({
    onChange: (snapshot) => {
      // 更新消息列表
    },
    onError: (err) => {
      console.error('监听失败', err);
    }
  });
```

## 权限控制

### 1. 登录检查
所有功能都需要用户登录：
- 查看关注/粉丝列表
- 关注/取消关注用户
- 发起私信

### 2. 自我保护
- 不能关注自己
- 不能私信自己
- 查看自己时跳转到"我的"页面

## 用户体验优化

### 1. 友好的提示
- 未登录时显示"去登录"按钮
- 操作成功/失败都有明确的提示
- 加载状态显示

### 2. 错误处理
- 数据库初始化失败处理
- 网络请求失败处理
- 参数错误处理

### 3. 性能优化
- 延迟初始化数据库
- 使用实时监听减少轮询
- 限制查询数量（limit 20）

## 测试清单

### 关注/粉丝列表
- [ ] 未登录时提示登录
- [ ] 正确显示关注列表
- [ ] 正确显示粉丝列表
- [ ] 关注按钮状态正确
- [ ] 可以关注/取消关注
- [ ] 点击用户跳转到主页
- [ ] 点击自己跳转到"我的"页面

### 用户主页
- [ ] 正确显示用户信息
- [ ] 正确显示统计数据
- [ ] 关注状态正确
- [ ] 可以关注/取消关注
- [ ] 点击私信跳转到聊天页面
- [ ] 显示用户发布的内容
- [ ] 标签页切换正常

### 私信功能
- [ ] 未登录时提示登录
- [ ] 正确显示聊天历史
- [ ] 可以发送消息
- [ ] 实时接收新消息
- [ ] 自动滚动到最新消息
- [ ] 键盘弹出时输入框上移
- [ ] 不能私信自己

## 后续优化建议

1. **消息通知**
   - 添加未读消息提醒
   - 消息推送通知

2. **聊天功能增强**
   - 支持发送图片
   - 支持发送表情
   - 消息撤回功能

3. **用户主页增强**
   - 显示更多用户信息
   - 用户标签/认证
   - 用户作品集

4. **性能优化**
   - 消息分页加载
   - 图片懒加载
   - 缓存用户信息

5. **社交功能**
   - 互相关注标识
   - 共同关注显示
   - 推荐关注用户

