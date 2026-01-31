# 头像空白问题排查和修复指南

## 问题现象
用户头像显示为空白（白色圆圈）

## 可能的原因

### 1. 数据库中头像URL为空或无效
- `avatarUrl` 字段为空字符串 `""`
- `avatarUrl` 字段为 `null` 或 `undefined`
- `avatarUrl` 字段为字符串 `"undefined"` 或 `"null"`

### 2. 云存储临时URL过期
- 头像URL是临时URL，过期后无法访问
- `getUserInfo` 云函数没有正确转换URL

### 3. 图片加载失败
- 网络问题导致图片加载失败
- `binderror` 事件没有正确触发

## 排查步骤

### 步骤1：检查控制台输出

重新进入"我的"页面，查看控制台输出：

```
📊 当前用户信息: {
  nickName: "...",
  avatarUrl: "...",  ← 检查这个值
  userType: "..."
}
```

**如果 avatarUrl 是**：
- `""` (空字符串) → 数据库问题
- `"undefined"` 或 `"null"` → 数据库问题
- `"cloud://..."` → 临时URL过期
- `"https://..."` → 可能是网络问题

### 步骤2：检查数据库

打开云开发控制台 → 数据库 → `users` 集合，找到你的用户记录，检查：

```json
{
  "_id": "...",
  "_openid": "你的openid",
  "userInfo": {
    "nickName": "...",
    "avatarUrl": "..."  ← 检查这个值
  }
}
```

### 步骤3：手动修复数据库（如果需要）

如果数据库中的 `avatarUrl` 为空或无效，可以手动修改为默认头像：

```json
{
  "userInfo": {
    "nickName": "你的昵称",
    "avatarUrl": "/images/zhi.png"
  }
}
```

## 自动修复方案

### 方案A：重新编辑资料
1. 进入"编辑资料"页面
2. 重新选择头像
3. 点击"保存"
4. 这会重新上传头像到云存储

### 方案B：使用云函数修复

创建一个临时云函数来批量修复所有用户的空头像：

```javascript
// cloudfunctions/fixEmptyAvatars/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 查询所有头像为空的用户
    const users = await db.collection('users')
      .where({
        'userInfo.avatarUrl': db.command.in(['', null, 'undefined', 'null'])
      })
      .get();
    
    console.log('找到', users.data.length, '个头像为空的用户');
    
    // 批量更新
    const promises = users.data.map(user => {
      return db.collection('users')
        .doc(user._id)
        .update({
          data: {
            'userInfo.avatarUrl': '/images/zhi.png'
          }
        });
    });
    
    await Promise.all(promises);
    
    return {
      success: true,
      fixed: users.data.length
    };
  } catch (err) {
    console.error('修复失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
```

## 已实施的保护机制

### 1. app.js 启动时检查
```javascript
autoLogin: function () {
  if (!userInfo.avatarUrl || userInfo.avatarUrl.trim() === '') {
    userInfo.avatarUrl = '/images/zhi.png';
  }
  this.refreshUserInfo(openid);  // 从数据库刷新
}
```

### 2. mine 页面加载时检查
```javascript
checkLoginStatus: function () {
  if (!avatarUrl || avatarUrl.trim() === '' || 
      avatarUrl === 'undefined' || avatarUrl === 'null') {
    avatarUrl = '/images/zhi.png';
  }
}
```

### 3. 图片加载失败兜底
```xml
<image 
  src="{{userInfo.avatarUrl || '/images/zhi.png'}}" 
  binderror="onAvatarError"
/>
```

### 4. getUserInfo 云函数转换URL
```javascript
// 自动将 cloud:// 转换为临时 https:// URL
if (avatarUrl.startsWith('cloud://')) {
  const tempURLRes = await cloud.getTempFileURL({
    fileList: [avatarUrl]
  });
  avatarUrl = tempURLRes.fileList[0].tempFileURL;
}
```

## 测试清单

- [ ] 重新编译小程序
- [ ] 清除缓存（开发者工具 → 清除缓存）
- [ ] 退出登录
- [ ] 重新登录
- [ ] 检查头像是否正常显示
- [ ] 查看控制台输出
- [ ] 检查数据库中的 avatarUrl 字段

## 如果问题仍然存在

请提供以下信息：
1. 控制台输出的完整日志
2. 数据库中你的用户记录截图
3. 是否看到 `⚠️ 头像加载失败` 的日志
4. 头像URL的具体值

