# 用户信息显示问题修复说明

## 问题描述

1. **关注列表中的用户没有头像和昵称**
2. **点开别人的主页，显示的是自己的头像和昵称**

## 问题原因

数据库中的用户信息结构不统一，导致查询时获取不到正确的数据。

### 原有问题
`updateUserInfo` 云函数在保存用户信息时，同时保存了多个字段：
- `userInfo` 对象（包含 nickName 和 avatarUrl）
- 单独的 `nickName` 字段
- 单独的 `avatarUrl` 字段

但其他页面查询时可能只读取了部分字段，导致数据不一致。

---

## 修复方案

### 1. 统一数据结构

**users 集合标准结构：**
```javascript
{
  _id: "记录ID",
  _openid: "用户openid",
  userInfo: {                    // 公开信息（其他用户可见）
    nickName: "用户昵称",
    avatarUrl: "头像URL"
  },
  phoneNumber: "13800138000",    // 私密信息（仅管理员可见）
  stats: {                       // 统计信息
    followingCount: 0,
    followersCount: 0,
    likesCount: 0
  },
  createTime: "创建时间",
  updateTime: "更新时间"
}
```

### 2. 修复的文件

#### 2.1 cloudfunctions/updateUserInfo/index.js
- ✅ 统一只使用 `userInfo` 对象存储公开信息
- ✅ 移除冗余的 `nickName` 和 `avatarUrl` 字段
- ✅ `phoneNumber` 单独存储，不包含在 `userInfo` 中
- ✅ 添加 `stats` 对象初始化

#### 2.2 pages/user-profile/index.js
- ✅ 查询时只获取 `userInfo`、`stats` 和 `_openid` 字段
- ✅ 不查询 `phoneNumber`，保护隐私
- ✅ 使用 `field()` 方法明确指定查询字段
- ✅ 从 `stats` 对象读取统计数据

#### 2.3 pages/follow-list/index.js
- ✅ 查询时只获取 `userInfo`、`stats` 和 `_openid` 字段
- ✅ 不查询 `phoneNumber`，保护隐私
- ✅ 确保正确读取 `userInfo` 对象
- ✅ 添加详细的调试日志

---

## 部署步骤

### 第一步：重新部署云函数

```bash
cd cloudfunctions/updateUserInfo
npm install
# 右键 -> 上传并部署：云端安装依赖
```

### 第二步：清理现有数据（可选）

如果数据库中已有不规范的数据，可以选择：

**方案A：让用户重新登录**
- 用户重新登录后，会自动更新为新的数据结构
- 推荐方案，无需手动操作

**方案B：手动清理数据库**
- 在云开发控制台打开 `users` 集合
- 删除所有记录（或导出备份后删除）
- 让用户重新登录

**方案C：编写数据迁移脚本**
```javascript
// 在云开发控制台的云函数中执行
const db = cloud.database();

exports.main = async (event, context) => {
  const users = await db.collection('users').get();
  
  for (const user of users.data) {
    const updateData = {
      userInfo: {
        nickName: user.nickName || user.userInfo?.nickName || '未知用户',
        avatarUrl: user.avatarUrl || user.userInfo?.avatarUrl || '/images/zhi.png'
      },
      stats: user.stats || {
        followingCount: 0,
        followersCount: 0,
        likesCount: 0
      }
    };
    
    // 移除冗余字段
    await db.collection('users').doc(user._id).update({
      data: updateData
    });
  }
  
  return { success: true, count: users.data.length };
};
```

### 第三步：测试验证

1. **测试登录**
   - 退出登录
   - 重新登录
   - 检查数据库中的用户信息结构是否正确

2. **测试关注列表**
   - 打开关注列表
   - 检查是否显示头像和昵称
   - 查看控制台日志

3. **测试用户主页**
   - 点击用户进入主页
   - 检查是否显示正确的用户信息
   - 查看控制台日志

---

## 验证方法

### 1. 查看控制台日志

**关注列表页面：**
```
查询关注/粉丝列表，查询条件: {...}
查询到的关注/粉丝记录: [...]
提取的用户ID列表: [...]
查询到的用户信息: [...]
用户映射: openid -> userInfo
处理用户: openid 用户信息: {...}
最终的用户列表: [...]
```

**用户主页：**
```
用户主页 onLoad，目标用户ID: xxxxx
正在加载用户信息，目标openid: xxxxx
查询用户信息结果: {...}
找到用户数据: {...}
设置用户信息: {nickName: "xxx", avatarUrl: "xxx"}
```

### 2. 检查数据库

在云开发控制台打开 `users` 集合，检查数据结构：

**正确的结构：**
```json
{
  "_id": "xxx",
  "_openid": "xxx",
  "userInfo": {
    "nickName": "张三",
    "avatarUrl": "cloud://xxx.jpg"
  },
  "phoneNumber": "13800138000",
  "stats": {
    "followingCount": 5,
    "followersCount": 10,
    "likesCount": 20
  }
}
```

**错误的结构（需要修复）：**
```json
{
  "_id": "xxx",
  "_openid": "xxx",
  "nickName": "张三",           // ❌ 冗余字段
  "avatarUrl": "cloud://xxx.jpg", // ❌ 冗余字段
  "userInfo": {
    "nickName": "张三",
    "avatarUrl": "cloud://xxx.jpg"
  }
}
```

---

## 注意事项

### 1. 隐私保护
- ✅ 所有查询都使用 `field()` 方法，不查询 `phoneNumber`
- ✅ 前端永远不会获取到手机号
- ✅ 手机号只存储在数据库，仅管理员可见

### 2. 数据一致性
- ✅ 统一使用 `userInfo` 对象存储公开信息
- ✅ 所有页面查询方式一致
- ✅ 避免字段冗余

### 3. 性能优化
- ✅ 使用 `field()` 方法只查询需要的字段
- ✅ 减少数据传输量
- ✅ 提高查询速度

---

## 常见问题

### Q1: 为什么关注列表还是没有头像？
**A:** 可能是数据库中的用户信息还是旧结构，需要：
1. 让该用户重新登录一次
2. 或者运行数据迁移脚本

### Q2: 如何确认数据结构是否正确？
**A:** 在云开发控制台查看 `users` 集合，确认：
- 有 `userInfo` 对象
- `userInfo` 包含 `nickName` 和 `avatarUrl`
- 没有单独的 `nickName` 和 `avatarUrl` 字段

### Q3: 手机号会泄露吗？
**A:** 不会，因为：
- 所有查询都使用 `field()` 明确指定字段
- 不包含 `phoneNumber` 字段
- 前端代码无法获取手机号

---

## 测试清单

- [ ] 重新部署 `updateUserInfo` 云函数
- [ ] 退出登录并重新登录
- [ ] 检查数据库中的用户信息结构
- [ ] 打开关注列表，检查头像和昵称显示
- [ ] 点击用户进入主页，检查信息显示
- [ ] 查看控制台日志，确认数据正确
- [ ] 测试关注/取消关注功能
- [ ] 测试互相关注标识显示

---

## 相关文档

- [优化总结](./OPTIMIZATION_SUMMARY.md)
- [数据库操作详解](./SOCIAL_SYSTEM_DATABASE.md)
- [云函数实现](./SOCIAL_SYSTEM_CLOUDFUNCTIONS.md)

