# 小红书风格社交系统 - 实施计划

## 📋 实施步骤

### 阶段一：数据库准备（1天）

#### 1.1 创建数据库集合
在云开发控制台创建以下集合：

- [x] `users` - 用户信息
- [x] `follows` - 关注关系
- [ ] `conversations` - 会话列表
- [x] `messages` - 聊天消息
- [ ] `notifications` - 通知消息

#### 1.2 配置数据库权限
```javascript
// users 集合权限
{
  "read": true,
  "write": "doc._openid == auth.openid"
}

// follows 集合权限
{
  "read": true,
  "write": "doc._openid == auth.openid"
}

// conversations 集合权限
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}

// messages 集合权限
{
  "read": "doc.senderId == auth.openid || doc.receiverId == auth.openid",
  "write": "doc._openid == auth.openid"
}

// notifications 集合权限
{
  "read": "doc._openid == auth.openid",
  "write": false
}
```

#### 1.3 创建数据库索引
按照 `SOCIAL_SYSTEM_DATABASE.md` 中的建议创建索引

---

### 阶段二：云函数开发（2天）

#### 2.1 创建云函数目录
```
cloudfunctions/
├── updateUserStats/
├── updateConversation/
├── createNotification/
├── getFollowList/
├── getNotificationList/
├── batchMarkAsRead/
└── checkFollowStatus/
```

#### 2.2 开发云函数
按照 `SOCIAL_SYSTEM_CLOUDFUNCTIONS.md` 实现各个云函数

#### 2.3 部署云函数
```bash
# 在每个云函数目录下
npm install
# 右键上传并部署
```

---

### 阶段三：页面开发（3-4天）

#### 3.1 优化现有页面

**pages/notify/notify（消息中心）**
- [ ] 添加Tab切换（私信、通知、互动）
- [ ] 实现会话列表
- [ ] 显示未读红点
- [ ] 支持删除和置顶会话

**pages/chat/chat（聊天页面）**
- [x] 基础聊天功能（已完成）
- [ ] 添加图片发送
- [ ] 添加消息撤回
- [ ] 显示消息状态（已读/未读）
- [ ] 优化UI样式

**pages/user-profile/index（用户主页）**
- [x] 基础信息展示（已完成）
- [ ] 添加"互相关注"标识
- [ ] 优化关注按钮样式
- [ ] 添加更多操作菜单

**pages/follow-list/index（关注/粉丝列表）**
- [x] 基础列表展示（已完成）
- [ ] 添加搜索功能
- [ ] 显示"互相关注"标识
- [ ] 优化列表样式

#### 3.2 创建新页面

**pages/notification-list/index（通知列表）**
```
pages/notification-list/
├── index.js
├── index.wxml
├── index.wxss
└── index.json
```

---

### 阶段四：功能完善（2天）

#### 4.1 实时功能
- [ ] 消息实时推送（watch监听）
- [ ] 通知实时更新
- [ ] 关注状态实时同步

#### 4.2 交互优化
- [ ] 添加加载动画
- [ ] 添加下拉刷新
- [ ] 添加上拉加载更多
- [ ] 添加骨架屏

#### 4.3 错误处理
- [ ] 网络错误提示
- [ ] 数据为空提示
- [ ] 操作失败提示

---

### 阶段五：测试与优化（1-2天）

#### 5.1 功能测试
- [ ] 关注/取消关注
- [ ] 发送/接收消息
- [ ] 通知推送
- [ ] 数据同步

#### 5.2 性能优化
- [ ] 图片懒加载
- [ ] 数据缓存
- [ ] 请求防抖

#### 5.3 用户体验优化
- [ ] 动画效果
- [ ] 反馈提示
- [ ] 引导说明

---

## 🎨 UI设计规范

### 颜色方案
```css
/* 主色调 */
--primary-color: #ff2442;      /* 小红书红 */
--primary-light: #ff6b81;
--primary-dark: #d81e3a;

/* 辅助色 */
--text-primary: #333333;
--text-secondary: #666666;
--text-tertiary: #999999;
--border-color: #eeeeee;
--bg-color: #f8f8f8;

/* 功能色 */
--success-color: #52c41a;
--warning-color: #faad14;
--error-color: #f5222d;
--info-color: #1890ff;
```

### 字体规范
```css
/* 标题 */
--font-size-h1: 36rpx;
--font-size-h2: 32rpx;
--font-size-h3: 28rpx;

/* 正文 */
--font-size-base: 28rpx;
--font-size-small: 24rpx;
--font-size-mini: 20rpx;

/* 字重 */
--font-weight-bold: 600;
--font-weight-medium: 500;
--font-weight-normal: 400;
```

### 间距规范
```css
--spacing-xs: 8rpx;
--spacing-sm: 16rpx;
--spacing-md: 24rpx;
--spacing-lg: 32rpx;
--spacing-xl: 48rpx;
```

### 圆角规范
```css
--border-radius-sm: 8rpx;
--border-radius-md: 16rpx;
--border-radius-lg: 24rpx;
--border-radius-round: 50%;
```

---

## 📱 关键页面设计

### 1. 消息中心改版

#### Tab栏设计
```xml
<view class="tabs">
  <view class="tab-item {{currentTab === 0 ? 'active' : ''}}" bindtap="switchTab" data-tab="0">
    <text>私信</text>
    <view class="badge" wx:if="{{unreadMessage > 0}}">{{unreadMessage}}</view>
  </view>
  <view class="tab-item {{currentTab === 1 ? 'active' : ''}}" bindtap="switchTab" data-tab="1">
    <text>通知</text>
    <view class="badge" wx:if="{{unreadNotification > 0}}">{{unreadNotification}}</view>
  </view>
  <view class="tab-item {{currentTab === 2 ? 'active' : ''}}" bindtap="switchTab" data-tab="2">
    <text>互动</text>
    <view class="badge" wx:if="{{unreadInteraction > 0}}">{{unreadInteraction}}</view>
  </view>
</view>
```

#### 会话列表项设计
```xml
<view class="conversation-item" bindtap="openChat" data-id="{{item.targetId}}">
  <view class="avatar-wrapper">
    <image class="avatar" src="{{item.targetUserInfo.avatarUrl}}" />
    <view class="badge-dot" wx:if="{{item.unreadCount > 0}}"></view>
  </view>
  
  <view class="content">
    <view class="top-row">
      <text class="nickname">{{item.targetUserInfo.nickName}}</text>
      <text class="time">{{item.updateTime}}</text>
    </view>
    <view class="bottom-row">
      <text class="message">{{item.lastMessage.content}}</text>
      <view class="unread-badge" wx:if="{{item.unreadCount > 0}}">
        {{item.unreadCount > 99 ? '99+' : item.unreadCount}}
      </view>
    </view>
  </view>
  
  <view class="pin-icon" wx:if="{{item.isPinned}}">📌</view>
</view>
```

### 2. 通知列表设计

#### 通知类型分类
```xml
<view class="notification-types">
  <view class="type-item {{notifyType === 'all' ? 'active' : ''}}" bindtap="switchType" data-type="all">
    全部
  </view>
  <view class="type-item {{notifyType === 'follow' ? 'active' : ''}}" bindtap="switchType" data-type="follow">
    关注
  </view>
  <view class="type-item {{notifyType === 'like' ? 'active' : ''}}" bindtap="switchType" data-type="like">
    赞
  </view>
  <view class="type-item {{notifyType === 'comment' ? 'active' : ''}}" bindtap="switchType" data-type="comment">
    评论
  </view>
</view>
```

#### 通知列表项设计
```xml
<view class="notification-item {{item.isRead ? '' : 'unread'}}" bindtap="handleNotification" data-item="{{item}}">
  <image class="avatar" src="{{item.fromUserInfo.avatarUrl}}" />
  
  <view class="content">
    <text class="nickname">{{item.fromUserInfo.nickName}}</text>
    <text class="action">{{item.content}}</text>
    <text class="time">{{item.createTime}}</text>
  </view>
  
  <view class="related-content" wx:if="{{item.relatedId}}">
    <image class="thumb" src="{{item.relatedImage}}" />
  </view>
  
  <view class="unread-dot" wx:if="{{!item.isRead}}"></view>
</view>
```

### 3. 用户主页优化

#### 关注按钮状态
```xml
<view class="action-buttons">
  <!-- 未关注 -->
  <view class="btn-follow" wx:if="{{!isFollowing}}" bindtap="toggleFollow">
    <text>关注</text>
  </view>
  
  <!-- 已关注 -->
  <view class="btn-following" wx:elif="{{isFollowing && !isMutual}}" bindtap="toggleFollow">
    <text>已关注</text>
  </view>
  
  <!-- 互相关注 -->
  <view class="btn-mutual" wx:else bindtap="toggleFollow">
    <text>互相关注</text>
  </view>
  
  <!-- 私信按钮 -->
  <view class="btn-message" bindtap="navigateToChat">
    <text>私信</text>
  </view>
  
  <!-- 更多操作 -->
  <view class="btn-more" bindtap="showMoreActions">
    <text>···</text>
  </view>
</view>
```

---

## 🔧 技术要点

### 1. 实时消息推送

使用云数据库的 `watch` API：

```javascript
const watcher = db.collection('messages')
  .where({ roomId: roomId })
  .orderBy('createTime', 'asc')
  .watch({
    onChange: (snapshot) => {
      // 处理新消息
      this.handleNewMessages(snapshot.docs);
    },
    onError: (err) => {
      console.error('监听失败', err);
    }
  });
```

### 2. 消息时间格式化

```javascript
function formatMessageTime(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = now - time;
  
  // 1分钟内
  if (diff < 60000) {
    return '刚刚';
  }
  
  // 1小时内
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  
  // 今天
  if (now.toDateString() === time.toDateString()) {
    return time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === time.toDateString()) {
    return '昨天';
  }
  
  // 一周内
  if (diff < 7 * 24 * 3600000) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `星期${days[time.getDay()]}`;
  }
  
  // 更早
  return time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
```

### 3. 未读消息统计

```javascript
async function getUnreadCounts() {
  const db = wx.cloud.database();
  const openid = wx.getStorageSync('openid');
  
  // 未读私信数
  const conversations = await db.collection('conversations')
    .where({ _openid: openid })
    .get();
  
  const unreadMessage = conversations.data.reduce((sum, item) => {
    return sum + (item.unreadCount || 0);
  }, 0);
  
  // 未读通知数
  const notifications = await db.collection('notifications')
    .where({
      _openid: openid,
      isRead: false
    })
    .count();
  
  return {
    unreadMessage,
    unreadNotification: notifications.total
  };
}
```

---

## ✅ 验收标准

### 功能完整性
- [ ] 可以关注/取消关注用户
- [ ] 可以查看关注列表和粉丝列表
- [ ] 可以发送和接收私信
- [ ] 可以接收各类通知
- [ ] 未读消息有红点提示
- [ ] 消息实时推送

### 性能指标
- [ ] 页面加载时间 < 2秒
- [ ] 消息发送响应 < 1秒
- [ ] 列表滚动流畅（60fps）
- [ ] 图片加载优化

### 用户体验
- [ ] 界面美观，符合小红书风格
- [ ] 操作流畅，反馈及时
- [ ] 错误提示友好
- [ ] 支持下拉刷新和上拉加载

---

## 📚 参考资料

- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [小红书设计规范](https://www.xiaohongshu.com/)
- 本项目文档：
  - `SOCIAL_SYSTEM_DESIGN.md` - 系统设计
  - `SOCIAL_SYSTEM_DATABASE.md` - 数据库操作
  - `SOCIAL_SYSTEM_CLOUDFUNCTIONS.md` - 云函数实现

