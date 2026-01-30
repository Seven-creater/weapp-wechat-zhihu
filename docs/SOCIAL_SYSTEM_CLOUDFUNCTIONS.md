# 小红书风格社交系统 - 云函数实现

## 1. updateUserStats（更新用户统计）

### 功能
更新用户的关注数、粉丝数等统计信息

### 代码实现

```javascript
// cloudfunctions/updateUserStats/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, followerId, targetId } = event;
  
  try {
    if (action === 'follow') {
      // 关注者的关注数+1
      await db.collection('users').where({
        _openid: followerId
      }).update({
        data: {
          'stats.followingCount': _.inc(1)
        }
      });
      
      // 被关注者的粉丝数+1
      await db.collection('users').where({
        _openid: targetId
      }).update({
        data: {
          'stats.followersCount': _.inc(1)
        }
      });
      
      return { success: true, message: '关注成功' };
      
    } else if (action === 'unfollow') {
      // 关注者的关注数-1
      await db.collection('users').where({
        _openid: followerId
      }).update({
        data: {
          'stats.followingCount': _.inc(-1)
        }
      });
      
      // 被关注者的粉丝数-1
      await db.collection('users').where({
        _openid: targetId
      }).update({
        data: {
          'stats.followersCount': _.inc(-1)
        }
      });
      
      return { success: true, message: '取消关注成功' };
    }
    
    return { success: false, error: '未知操作' };
    
  } catch (err) {
    console.error('更新统计失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 2. updateConversation（更新会话）

### 功能
发送消息时更新会话列表，标记已读

### 代码实现

```javascript
// cloudfunctions/updateConversation/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, targetId, lastMessage, userInfo } = event;
  
  try {
    if (action === 'send') {
      // 发送消息时更新双方的会话记录
      await updateOrCreateConversation(openid, targetId, lastMessage, userInfo, false);
      await updateOrCreateConversation(targetId, openid, lastMessage, userInfo, true);
      
      return { success: true };
      
    } else if (action === 'read') {
      // 标记消息已读
      await db.collection('conversations').where({
        _openid: openid,
        targetId: targetId
      }).update({
        data: {
          unreadCount: 0
        }
      });
      
      return { success: true };
    }
    
    return { success: false, error: '未知操作' };
    
  } catch (err) {
    console.error('更新会话失败:', err);
    return { success: false, error: err.message };
  }
};

// 更新或创建会话记录
async function updateOrCreateConversation(userId, targetId, lastMessage, targetUserInfo, isReceiver) {
  const conversation = await db.collection('conversations').where({
    _openid: userId,
    targetId: targetId
  }).get();
  
  if (conversation.data.length > 0) {
    // 更新已有会话
    const updateData = {
      lastMessage: {
        content: lastMessage,
        type: 'text',
        senderId: isReceiver ? targetId : userId,
        time: db.serverDate()
      },
      updateTime: db.serverDate()
    };
    
    if (isReceiver) {
      updateData.unreadCount = _.inc(1);
    }
    
    await db.collection('conversations').doc(conversation.data[0]._id).update({
      data: updateData
    });
  } else {
    // 创建新会话
    await db.collection('conversations').add({
      data: {
        _openid: userId,
        targetId: targetId,
        targetUserInfo: targetUserInfo,
        lastMessage: {
          content: lastMessage,
          type: 'text',
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

---

## 3. createNotification（创建通知）

### 功能
创建各类通知（关注、点赞、评论等）

### 代码实现

```javascript
// cloudfunctions/createNotification/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const fromUserId = wxContext.OPENID;
  const { type, receiverId, content, relatedId } = event;
  
  try {
    // 获取触发者信息
    const fromUser = await db.collection('users').where({
      _openid: fromUserId
    }).get();
    
    const fromUserInfo = fromUser.data[0]?.userInfo || {
      nickName: '未知用户',
      avatarUrl: ''
    };
    
    // 创建通知
    await db.collection('notifications').add({
      data: {
        _openid: receiverId,
        type: type,
        fromUserId: fromUserId,
        fromUserInfo: fromUserInfo,
        content: content,
        relatedId: relatedId || '',
        isRead: false,
        createTime: db.serverDate()
      }
    });
    
    return { success: true };
    
  } catch (err) {
    console.error('创建通知失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 4. getFollowList（获取关注/粉丝列表）

### 功能
获取关注列表或粉丝列表，包含用户信息和关注状态

### 代码实现

```javascript
// cloudfunctions/getFollowList/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { type, targetUserId, page = 1, pageSize = 20 } = event;
  
  try {
    const userId = targetUserId || openid;
    let follows;
    
    if (type === 'following') {
      // 查询关注列表
      follows = await db.collection('follows')
        .where({ followerId: userId })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
    } else {
      // 查询粉丝列表
      follows = await db.collection('follows')
        .where({ targetId: userId })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
    }
    
    if (follows.data.length === 0) {
      return { success: true, data: [], hasMore: false };
    }
    
    // 获取用户ID列表
    const userIds = follows.data.map(f => 
      type === 'following' ? f.targetId : f.followerId
    );
    
    // 查询用户信息
    const users = await db.collection('users')
      .where({
        _openid: db.command.in(userIds)
      })
      .get();
    
    // 查询我的关注列表（用于判断关注状态）
    const myFollows = await db.collection('follows')
      .where({
        followerId: openid,
        targetId: db.command.in(userIds)
      })
      .get();
    
    const followingSet = new Set(myFollows.data.map(f => f.targetId));
    
    // 组合数据
    const userMap = {};
    users.data.forEach(u => {
      userMap[u._openid] = u;
    });
    
    const result = follows.data.map(f => {
      const uid = type === 'following' ? f.targetId : f.followerId;
      const user = userMap[uid] || {};
      
      return {
        userId: uid,
        userInfo: user.userInfo || { nickName: '未知用户', avatarUrl: '' },
        stats: user.stats || {},
        isFollowing: followingSet.has(uid),
        isMutual: f.isMutual || false,
        isSelf: uid === openid,
        followTime: f.createTime
      };
    });
    
    return {
      success: true,
      data: result,
      hasMore: follows.data.length >= pageSize
    };
    
  } catch (err) {
    console.error('获取列表失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 5. getNotificationList（获取通知列表）

### 功能
获取通知列表，支持分类和分页

### 代码实现

```javascript
// cloudfunctions/getNotificationList/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { type = 'all', page = 1, pageSize = 20 } = event;
  
  try {
    let query = db.collection('notifications').where({
      _openid: openid
    });
    
    // 按类型筛选
    if (type !== 'all') {
      query = query.where({ type: type });
    }
    
    // 查询通知
    const notifications = await query
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    
    // 查询未读数量
    const unreadCount = await db.collection('notifications')
      .where({
        _openid: openid,
        isRead: false
      })
      .count();
    
    return {
      success: true,
      data: notifications.data,
      unreadCount: unreadCount.total,
      hasMore: notifications.data.length >= pageSize
    };
    
  } catch (err) {
    console.error('获取通知失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 6. batchMarkAsRead（批量标记已读）

### 功能
批量标记通知为已读

### 代码实现

```javascript
// cloudfunctions/batchMarkAsRead/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { type = 'all', ids = [] } = event;
  
  try {
    if (ids.length > 0) {
      // 标记指定的通知为已读
      await db.collection('notifications')
        .where({
          _openid: openid,
          _id: db.command.in(ids)
        })
        .update({
          data: {
            isRead: true
          }
        });
    } else if (type === 'all') {
      // 标记所有通知为已读
      await db.collection('notifications')
        .where({
          _openid: openid,
          isRead: false
        })
        .update({
          data: {
            isRead: true
          }
        });
    } else {
      // 标记指定类型的通知为已读
      await db.collection('notifications')
        .where({
          _openid: openid,
          type: type,
          isRead: false
        })
        .update({
          data: {
            isRead: true
          }
        });
    }
    
    return { success: true };
    
  } catch (err) {
    console.error('标记已读失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 7. checkFollowStatus（检查关注状态）

### 功能
批量检查多个用户的关注状态

### 代码实现

```javascript
// cloudfunctions/checkFollowStatus/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { userIds = [] } = event;
  
  try {
    if (userIds.length === 0) {
      return { success: true, data: {} };
    }
    
    // 查询我关注的用户
    const myFollows = await db.collection('follows')
      .where({
        followerId: openid,
        targetId: db.command.in(userIds)
      })
      .get();
    
    // 查询关注我的用户
    const followsMe = await db.collection('follows')
      .where({
        followerId: db.command.in(userIds),
        targetId: openid
      })
      .get();
    
    // 构建结果
    const result = {};
    const followingSet = new Set(myFollows.data.map(f => f.targetId));
    const followerSet = new Set(followsMe.data.map(f => f.followerId));
    
    userIds.forEach(uid => {
      result[uid] = {
        isFollowing: followingSet.has(uid),
        isFollower: followerSet.has(uid),
        isMutual: followingSet.has(uid) && followerSet.has(uid)
      };
    });
    
    return { success: true, data: result };
    
  } catch (err) {
    console.error('检查关注状态失败:', err);
    return { success: false, error: err.message };
  }
};
```

---

## 8. 云函数配置文件

### package.json

```json
{
  "name": "social-cloudfunctions",
  "version": "1.0.0",
  "description": "社交系统云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

### 部署说明

1. 在每个云函数目录下运行：
```bash
npm install
```

2. 右键点击云函数目录，选择"上传并部署：云端安装依赖"

3. 配置云函数权限（在云开发控制台）：
   - 所有云函数都需要访问数据库的权限
   - 设置合理的超时时间（建议10-20秒）
   - 配置内存大小（建议256MB）

---

## 9. 云函数调用示例

### 前端调用示例

```javascript
// 关注用户
wx.cloud.callFunction({
  name: 'updateUserStats',
  data: {
    action: 'follow',
    followerId: myOpenid,
    targetId: targetOpenid
  }
}).then(res => {
  console.log('关注成功', res);
}).catch(err => {
  console.error('关注失败', err);
});

// 获取关注列表
wx.cloud.callFunction({
  name: 'getFollowList',
  data: {
    type: 'following',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  if (res.result.success) {
    console.log('关注列表', res.result.data);
  }
});

// 创建通知
wx.cloud.callFunction({
  name: 'createNotification',
  data: {
    type: 'follow',
    receiverId: targetOpenid,
    content: '关注了你'
  }
});

// 获取通知列表
wx.cloud.callFunction({
  name: 'getNotificationList',
  data: {
    type: 'all',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  if (res.result.success) {
    console.log('通知列表', res.result.data);
    console.log('未读数量', res.result.unreadCount);
  }
});
```

