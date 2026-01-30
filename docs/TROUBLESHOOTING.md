# 🔧 问题诊断和修复指南

## 问题清单

1. ❌ 别人关注我，我的粉丝数没有改变
2. ❌ 社区的帖子用户头像和名字变成匿名的
3. ❌ 我点开别人的主页，依旧还是我的头像和昵称
4. ❌ 私信里，别人的头像和昵称还是我的

## 根本原因

**用户信息没有保存到云端数据库的 `users` 集合中**

---

## 🚨 立即修复步骤

### 第一步：确认云函数已部署 ⭐ 最重要

在微信开发者工具中：

1. 找到 `cloudfunctions/updateUserInfo` 文件夹
2. **右键点击** → 选择 **"上传并部署：云端安装依赖"**
3. 等待部署完成（看到"上传成功"提示）

**同时部署其他云函数：**
```
cloudfunctions/
├── updateUserInfo/         ← 必须部署！
├── updateUserStats/        ← 必须部署！
├── updateConversation/     ← 建议部署
└── migrateUserData/        ← 建议部署
```

### 第二步：检查数据库

在云开发控制台 → 数据库 → `users` 集合：

**检查是否有数据：**
- 如果是空的 → 说明用户信息没有保存
- 如果有数据 → 检查数据结构是否正确

**正确的数据结构：**
```json
{
  "_id": "xxx",
  "_openid": "用户的openid",
  "userInfo": {
    "nickName": "用户昵称",
    "avatarUrl": "头像URL"
  },
  "phoneNumber": "13800138000",
  "stats": {
    "followingCount": 0,
    "followersCount": 0,
    "likesCount": 0
  },
  "createTime": "2026-01-30...",
  "updateTime": "2026-01-30..."
}
```

### 第三步：所有用户重新登录 ⭐ 关键步骤

**每个用户都需要：**

1. **退出登录**
   - 打开小程序
   - 进入"我的"页面
   - 点击"退出登录"

2. **重新登录**
   - 点击"点击登录"
   - 选择头像
   - 输入昵称
   - 输入手机号（11位）
   - 点击"完成"

3. **验证是否成功**
   - 打开云开发控制台
   - 查看 `users` 集合
   - 应该能看到新增的用户记录

### 第四步：测试功能

重新登录后，测试以下功能：

- [ ] 打开"关注"列表，检查是否显示头像和昵称
- [ ] 点击用户主页，检查是否显示正确信息
- [ ] 查看社区帖子，检查是否显示用户信息
- [ ] 测试关注功能，检查粉丝数是否更新
- [ ] 测试私信功能，检查是否显示对方信息

---

## 🔍 详细诊断

### 诊断工具1：检查云函数是否部署

在小程序控制台执行：

```javascript
// 测试 updateUserInfo 云函数
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: '测试用户',
    avatarUrl: '/images/zhi.png',
    phoneNumber: '13800138000'
  }
}).then(res => {
  console.log('✅ 云函数部署成功:', res);
  if (res.result.success) {
    console.log('✅ 用户信息保存成功');
  } else {
    console.log('❌ 保存失败:', res.result.error);
  }
}).catch(err => {
  console.error('❌ 云函数未部署或调用失败:', err);
});
```

**预期结果：**
- ✅ 成功：显示 "云函数部署成功" 和 "用户信息保存成功"
- ❌ 失败：显示错误信息，需要重新部署云函数

### 诊断工具2：检查 users 集合数据

在小程序控制台执行：

```javascript
// 查询当前用户信息
const openid = wx.getStorageSync('openid');
console.log('当前用户 openid:', openid);

wx.cloud.database().collection('users').where({
  _openid: openid
}).get().then(res => {
  console.log('=== 用户信息查询结果 ===');
  if (res.data.length > 0) {
    console.log('✅ 找到用户记录');
    console.log('用户信息:', res.data[0]);
    console.log('userInfo:', res.data[0].userInfo);
    console.log('stats:', res.data[0].stats);
  } else {
    console.log('❌ 没有找到用户记录');
    console.log('需要重新登录！');
  }
}).catch(err => {
  console.error('查询失败:', err);
});
```

**预期结果：**
- ✅ 成功：显示用户信息，包含 userInfo 和 stats
- ❌ 失败：显示"没有找到用户记录"，需要重新登录

### 诊断工具3：批量检查所有用户

在小程序控制台执行：

```javascript
// 查询所有用户
wx.cloud.database().collection('users').get().then(res => {
  console.log('=== 所有用户列表 ===');
  console.log('总用户数:', res.data.length);
  
  res.data.forEach((user, index) => {
    console.log(`\n用户 ${index + 1}:`);
    console.log('  openid:', user._openid);
    console.log('  昵称:', user.userInfo?.nickName || '❌ 缺失');
    console.log('  头像:', user.userInfo?.avatarUrl || '❌ 缺失');
    console.log('  手机号:', user.phoneNumber ? '✅ 已设置' : '❌ 缺失');
    console.log('  stats:', user.stats ? '✅ 已设置' : '❌ 缺失');
  });
}).catch(err => {
  console.error('查询失败:', err);
});
```

---

## 🛠️ 修复方案

### 方案A：重新部署 + 重新登录（推荐）

1. **部署云函数**
   ```
   updateUserInfo → 右键 → 上传并部署
   updateUserStats → 右键 → 上传并部署
   ```

2. **所有用户重新登录**
   - 每个用户都需要退出并重新登录
   - 登录时会自动创建正确的用户记录

3. **验证**
   - 检查 users 集合是否有数据
   - 测试关注、私信等功能

### 方案B：使用数据迁移工具

如果已经有一些用户数据，但结构不正确：

```javascript
// 1. 部署迁移工具
// cloudfunctions/migrateUserData → 右键 → 上传并部署

// 2. 执行迁移
wx.cloud.callFunction({
  name: 'migrateUserData',
  data: { action: 'migrate' }
}).then(res => {
  console.log('迁移完成:', res.result);
});
```

### 方案C：手动创建用户记录（临时方案）

如果云函数无法部署，可以手动在数据库中创建记录：

1. 打开云开发控制台 → 数据库 → `users` 集合
2. 点击"添加记录"
3. 填写以下内容：

```json
{
  "_openid": "用户的openid（从storage中获取）",
  "userInfo": {
    "nickName": "用户昵称",
    "avatarUrl": "头像URL"
  },
  "phoneNumber": "13800138000",
  "stats": {
    "followingCount": 0,
    "followersCount": 0,
    "likesCount": 0
  }
}
```

---

## ✅ 验证清单

完成修复后，逐项检查：

### 基础功能
- [ ] 云函数 updateUserInfo 已部署
- [ ] 云函数 updateUserStats 已部署
- [ ] users 集合有数据
- [ ] 用户记录结构正确

### 用户信息显示
- [ ] 关注列表显示头像和昵称
- [ ] 用户主页显示正确信息
- [ ] 社区帖子显示用户信息
- [ ] 私信显示对方信息

### 统计功能
- [ ] 关注后，对方粉丝数+1
- [ ] 取消关注后，对方粉丝数-1
- [ ] 互相关注显示紫色按钮

### 私信功能
- [ ] 可以发送消息
- [ ] 会话列表显示对方信息
- [ ] 未读消息数量正确

---

## 🚨 常见错误

### 错误1：云函数调用失败
```
Error: errCode: -1 | errMsg: cloud.callFunction:fail
```

**原因：** 云函数未部署或名称错误

**解决：** 重新部署云函数，确认名称正确

### 错误2：数据库权限错误
```
Error: permission denied
```

**原因：** 数据库权限配置错误

**解决：** 
1. 打开云开发控制台 → 数据库 → users 集合
2. 点击"权限设置"
3. 设置为：
   ```json
   {
     "read": true,
     "write": "doc._openid == auth.openid"
   }
   ```

### 错误3：用户信息为空
```
userInfo: undefined
```

**原因：** 用户没有重新登录

**解决：** 退出登录后重新登录

---

## 📞 需要帮助？

如果按照以上步骤仍然无法解决，请提供：

1. **云函数部署截图**
2. **users 集合数据截图**
3. **控制台错误日志**
4. **具体的操作步骤**

---

## 🎯 快速修复命令

复制以下代码到小程序控制台，一键诊断：

```javascript
console.log('=== 开始诊断 ===\n');

// 1. 检查 openid
const openid = wx.getStorageSync('openid');
console.log('1. 当前用户 openid:', openid || '❌ 未登录');

// 2. 检查本地用户信息
const localUserInfo = wx.getStorageSync('userInfo');
console.log('2. 本地用户信息:', localUserInfo || '❌ 无');

// 3. 测试云函数
console.log('\n3. 测试云函数...');
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: '测试',
    avatarUrl: '/images/zhi.png',
    phoneNumber: '13800138000'
  }
}).then(res => {
  console.log('   ✅ updateUserInfo 云函数正常');
}).catch(err => {
  console.log('   ❌ updateUserInfo 云函数异常:', err.errMsg);
});

// 4. 检查数据库
console.log('\n4. 检查数据库...');
wx.cloud.database().collection('users').where({
  _openid: openid
}).get().then(res => {
  if (res.data.length > 0) {
    console.log('   ✅ 找到用户记录');
    console.log('   - 昵称:', res.data[0].userInfo?.nickName);
    console.log('   - 头像:', res.data[0].userInfo?.avatarUrl ? '✅' : '❌');
    console.log('   - stats:', res.data[0].stats ? '✅' : '❌');
  } else {
    console.log('   ❌ 未找到用户记录，需要重新登录！');
  }
}).catch(err => {
  console.log('   ❌ 数据库查询失败:', err.errMsg);
});

console.log('\n=== 诊断完成 ===');
```

---

**最后更新：2026-01-30**

