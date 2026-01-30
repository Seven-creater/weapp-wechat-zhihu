# 小红书风格社交系统 - 数据库操作详解

## 1. 关注系统数据库操作

### 1.1 关注用户

```javascript
// 添加关注记录
async function followUser(followerId, targetId) {
  const db = wx.cloud.database();
  
  // 1. 添加关注记录
  await db.collection('follows').add({
    data: {
      followerId: followerId,
      targetId: targetId,
      isMutual: false,
      createTime: db.serverDate()
    }
  });
  
  // 2. 检查是否互相关注
  const reverseFollow = await db.collection('follows')
    .where({
      followerId: targetId,
      targetId: followerId
    })
    .get();
  
  if (reverseFollow.data.length > 0) {
    // 更新为互相关注
    await db.collection('follows')
      .where({
        followerId: db.command.in([followerId, targetId]),
        targetId: db.command.in([followerId, targetId])
      })
      .update({
        data: { isMutual: true }
      });
  }
  
  // 3. 更新统计数据（通过云函数）
  await wx.cloud.callFunction({
    name: 'updateUserStats',
    data: {
      action: 'follow',
      followerId: followerId,
      targetId: targetId
    }
  });
  
  // 4. 创建通知
  await db.collection('notifications').add({
    data: {
      _openid: targetId,
      type: 'follow',
      fromUserId: followerId,
      isRead: false,
      createTime: db.serverDate()
    }
  });
}
```

### 1.2 取消关注

```javascript
async function unfollowUser(followerId, targetId) {
  const db = wx.cloud.database();
  
  // 1. 删除关注记录
  await db.collection('follows')
    .where({
      followerId: followerId,
      targetId: targetId
    })
    .remove();
  
  // 2. 更新对方的互相关注状态
  await db.collection('follows')
    .where({
      followerId: targetId,
      targetId: followerId
    })
    .update({
      data: { isMutual: false }
    });
  
  // 3. 更新统计数据
  await wx.cloud.callFunction({
    name: 'updateUserStats',
    data: {
      action: 'unfollow',
      followerId: followerId,
      targetId: targetId
    }
  });
}
```

### 1.3 查询关注列表

```javascript
async function getFollowingList(userId, page = 1, pageSize = 20) {
  const db = wx.cloud.database();
  
  // 1. 查询关注记录
  const follows = await db.collection('follows')
    .where({ followerId: userId })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  // 2. 获取用户信息
  const userIds = follows.data.map(f => f.targetId);
  const users = await db.collection('users')
    .where({
      _openid: db.command.in(userIds)
    })
    .get();
  
  // 3. 组合数据
  const userMap = {};
  users.data.forEach(u => {
    userMap[u._openid] = u;
  });
  
  return follows.data.map(f => ({
    ...f,
    userInfo: userMap[f.targetId]?.userInfo || {},
    stats: userMap[f.targetId]?.stats || {}
  }));
}
```

### 1.4 查询粉丝列表

```javascript
async function getFollowersList(userId, page = 1, pageSize = 20) {
  const db = wx.cloud.database();
  
  // 1. 查询粉丝记录
  const followers = await db.collection('follows')
    .where({ targetId: userId })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  // 2. 获取用户信息
  const userIds = followers.data.map(f => f.followerId);
  const users = await db.collection('users')
    .where({
      _openid: db.command.in(userIds)
    })
    .get();
  
  // 3. 检查我是否关注了他们
  const myFollows = await db.collection('follows')
    .where({
      followerId: userId,
      targetId: db.command.in(userIds)
    })
    .get();
  
  const followingSet = new Set(myFollows.data.map(f => f.targetId));
  
  // 4. 组合数据
  const userMap = {};
  users.data.forEach(u => {
    userMap[u._openid] = u;
  });
  
  return followers.data.map(f => ({
    ...f,
    userInfo: userMap[f.followerId]?.userInfo || {},
    stats: userMap[f.followerId]?.stats || {},
    isFollowing: followingSet.has(f.followerId)
  }));
}
```

---

## 2. 私信系统数据库操作

### 2.1 发送消息

```javascript
async function sendMessage(senderId, receiverId, content, type = 'text') {
  const db = wx.cloud.database();
  const roomId = [senderId, receiverId].sort().join('_');
  
  // 1. 保存消息
  const messageRes = await db.collection('messages').add({
    data: {
      roomId: roomId,
      senderId: senderId,
      receiverId: receiverId,
      content: content,
      type: type,
      status: 'sent',
      isRecalled: false,
      createTime: db.serverDate()
    }
  });
  
  // 2. 更新/创建会话记录（发送者）
  await updateConversation(senderId, receiverId, content, type);
  
  // 3. 更新/创建会话记录（接收者）
  await updateConversation(receiverId, senderId, content, type, true);
  
  return messageRes._id;
}
```

### 2.2 更新会话记录

```javascript
async function updateConversation(userId, targetId, lastContent, type, isReceiver = false) {
  const db = wx.cloud.database();
  
  // 查询是否已有会话
  const conversation = await db.collection('conversations')
    .where({
      _openid: userId,
      targetId: targetId
    })
    .get();
  
  // 获取对方用户信息
  const targetUser = await db.collection('users')
    .where({ _openid: targetId })
    .get();
  
  const targetUserInfo = targetUser.data[0]?.userInfo || {};
  
  if (conversation.data.length > 0) {
    // 更新已有会话
    await db.collection('conversations')
      .doc(conversation.data[0]._id)
      .update({
        data: {
          lastMessage: {
            content: lastContent,
            type: type,
            senderId: isReceiver ? targetId : userId,
            time: db.serverDate()
          },
          unreadCount: isReceiver ? db.command.inc(1) : 0,
          updateTime: db.serverDate()
        }
      });
  } else {
    // 创建新会话
    await db.collection('conversations').add({
      data: {
        _openid: userId,
        targetId: targetId,
        targetUserInfo: targetUserInfo,
        lastMessage: {
          content: lastContent,
          type: type,
          senderId: isReceiver ? targetId : userId,
          time: db.serverDate()
        },
        unreadCount: isReceiver ? 1 : 0,
        isPinned: false,
        isMuted: false,
        updateTime: db.serverDate()
      }
    });
  }
}
```

### 2.3 获取会话列表

```javascript
async function getConversationList(userId) {
  const db = wx.cloud.database();
  
  const conversations = await db.collection('conversations')
    .where({ _openid: userId })
    .orderBy('isPinned', 'desc')
    .orderBy('updateTime', 'desc')
    .get();
  
  return conversations.data;
}
```

### 2.4 获取聊天消息

```javascript
async function getChatMessages(userId, targetId, page = 1, pageSize = 20) {
  const db = wx.cloud.database();
  const roomId = [userId, targetId].sort().join('_');
  
  const messages = await db.collection('messages')
    .where({
      roomId: roomId,
      isRecalled: false
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return messages.data.reverse(); // 反转顺序，最新的在下面
}
```

### 2.5 标记消息已读

```javascript
async function markMessagesAsRead(userId, targetId) {
  const db = wx.cloud.database();
  
  // 1. 更新会话未读数
  await db.collection('conversations')
    .where({
      _openid: userId,
      targetId: targetId
    })
    .update({
      data: {
        unreadCount: 0
      }
    });
  
  // 2. 更新消息状态
  const roomId = [userId, targetId].sort().join('_');
  await db.collection('messages')
    .where({
      roomId: roomId,
      receiverId: userId,
      status: 'sent'
    })
    .update({
      data: {
        status: 'read'
      }
    });
}
```

### 2.6 撤回消息

```javascript
async function recallMessage(messageId, userId) {
  const db = wx.cloud.database();
  
  // 1. 检查消息是否存在且是自己发送的
  const message = await db.collection('messages')
    .doc(messageId)
    .get();
  
  if (!message.data || message.data.senderId !== userId) {
    throw new Error('无法撤回该消息');
  }
  
  // 2. 检查是否在2分钟内
  const now = new Date();
  const createTime = new Date(message.data.createTime);
  const diff = (now - createTime) / 1000 / 60; // 分钟
  
  if (diff > 2) {
    throw new Error('超过2分钟无法撤回');
  }
  
  // 3. 标记为已撤回
  await db.collection('messages')
    .doc(messageId)
    .update({
      data: {
        isRecalled: true,
        content: '消息已撤回'
      }
    });
}
```

---

## 3. 通知系统数据库操作

### 3.1 创建通知

```javascript
async function createNotification(receiverId, type, fromUserId, content, relatedId) {
  const db = wx.cloud.database();
  
  // 获取触发者信息
  const fromUser = await db.collection('users')
    .where({ _openid: fromUserId })
    .get();
  
  const fromUserInfo = fromUser.data[0]?.userInfo || {};
  
  // 创建通知
  await db.collection('notifications').add({
    data: {
      _openid: receiverId,
      type: type,
      fromUserId: fromUserId,
      fromUserInfo: fromUserInfo,
      content: content,
      relatedId: relatedId,
      isRead: false,
      createTime: db.serverDate()
    }
  });
}
```

### 3.2 获取通知列表

```javascript
async function getNotificationList(userId, type = 'all', page = 1, pageSize = 20) {
  const db = wx.cloud.database();
  
  let query = db.collection('notifications')
    .where({ _openid: userId });
  
  if (type !== 'all') {
    query = query.where({ type: type });
  }
  
  const notifications = await query
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return notifications.data;
}
```

### 3.3 标记通知已读

```javascript
async function markNotificationAsRead(notificationId) {
  const db = wx.cloud.database();
  
  await db.collection('notifications')
    .doc(notificationId)
    .update({
      data: {
        isRead: true
      }
    });
}
```

### 3.4 一键已读所有通知

```javascript
async function markAllNotificationsAsRead(userId) {
  const db = wx.cloud.database();
  
  await db.collection('notifications')
    .where({
      _openid: userId,
      isRead: false
    })
    .update({
      data: {
        isRead: true
      }
    });
}
```

### 3.5 获取未读通知数量

```javascript
async function getUnreadNotificationCount(userId) {
  const db = wx.cloud.database();
  
  const result = await db.collection('notifications')
    .where({
      _openid: userId,
      isRead: false
    })
    .count();
  
  return result.total;
}
```

---

## 4. 用户统计数据更新

### 4.1 更新关注/粉丝数

```javascript
async function updateFollowStats(userId, action) {
  const db = wx.cloud.database();
  const _ = db.command;
  
  if (action === 'follow') {
    // 增加关注数
    await db.collection('users')
      .where({ _openid: userId })
      .update({
        data: {
          'stats.followingCount': _.inc(1)
        }
      });
  } else if (action === 'unfollow') {
    // 减少关注数
    await db.collection('users')
      .where({ _openid: userId })
      .update({
        data: {
          'stats.followingCount': _.inc(-1)
        }
      });
  } else if (action === 'gain_follower') {
    // 增加粉丝数
    await db.collection('users')
      .where({ _openid: userId })
      .update({
        data: {
          'stats.followersCount': _.inc(1)
        }
      });
  } else if (action === 'lose_follower') {
    // 减少粉丝数
    await db.collection('users')
      .where({ _openid: userId })
      .update({
        data: {
          'stats.followersCount': _.inc(-1)
        }
      });
  }
}
```

---

## 5. 数据库索引建议

为了提高查询性能，建议创建以下索引：

### follows 集合
```javascript
// 索引1：查询我关注的人
{ followerId: 1, createTime: -1 }

// 索引2：查询关注我的人
{ targetId: 1, createTime: -1 }

// 索引3：检查关注关系
{ followerId: 1, targetId: 1 }
```

### messages 集合
```javascript
// 索引1：查询聊天室消息
{ roomId: 1, createTime: 1 }

// 索引2：查询未读消息
{ receiverId: 1, status: 1 }
```

### conversations 集合
```javascript
// 索引1：查询会话列表
{ _openid: 1, updateTime: -1 }

// 索引2：查询置顶会话
{ _openid: 1, isPinned: -1, updateTime: -1 }
```

### notifications 集合
```javascript
// 索引1：查询通知列表
{ _openid: 1, createTime: -1 }

// 索引2：查询未读通知
{ _openid: 1, isRead: 1 }

// 索引3：按类型查询
{ _openid: 1, type: 1, createTime: -1 }
```

