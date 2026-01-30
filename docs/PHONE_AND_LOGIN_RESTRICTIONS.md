# 登录限制和手机号功能说明

## 📋 新增功能

### 1. 登录前功能限制

**限制内容：**
- ❌ 未登录无法发布帖子
- ❌ 未登录无法查看消息
- ✅ 未登录可以浏览社区内容

**实现方式：**
- 发布页面（`pages/post/create.js`）：点击发布时检查登录状态
- 消息页面（`pages/notify/notify.js`）：进入页面时检查登录状态
- 未登录时弹出提示，引导用户前往登录

### 2. 手机号必填

**要求：**
- ✅ 登录时必须填写手机号
- ✅ 手机号必须是11位数字
- ✅ 手机号格式验证（1开头，第二位3-9）
- ✅ 不填写手机号无法完成登录
- ✅ 已禁用"跳过"按钮

**验证规则：**
```javascript
// 长度验证
phoneNumber.length === 11

// 格式验证
/^1[3-9]\d{9}$/.test(phoneNumber)
```

### 3. 手机号隐私保护

**保护措施：**
- ✅ 手机号保存到数据库
- ✅ 手机号不存储在本地 Storage
- ✅ 手机号不返回给前端
- ✅ 用户无法看到别人的手机号
- ✅ 只有后台管理员可以查看手机号

**数据结构：**
```javascript
// 数据库存储（完整信息）
{
  _openid: "xxx",
  nickName: "用户昵称",
  avatarUrl: "cloud://xxx.jpg",
  phoneNumber: "13800138000", // 仅后台可见
  createTime: Date,
  updateTime: Date
}

// 前端存储（公开信息）
{
  nickName: "用户昵称",
  avatarUrl: "cloud://xxx.jpg"
  // 不包含 phoneNumber
}
```

## 📁 修改的文件

### 1. 登录页面
- `pages/login/index.js` - 添加手机号输入和验证
- `pages/login/index.wxml` - 添加手机号输入框
- `pages/login/index.wxss` - 添加手机号输入框样式

### 2. 发布页面
- `pages/post/create.js` - 添加登录检查

### 3. 消息页面
- `pages/notify/notify.js` - 添加登录检查和隐私保护

### 4. 云函数
- `cloudfunctions/updateUserInfo/index.js` - 添加手机号保存和验证
- `cloudfunctions/getUserInfoAdmin/index.js` - 新增后台管理云函数

## 🔒 隐私保护机制

### 前端保护
```javascript
// 登录成功后，只存储公开信息
const publicUserInfo = {
  nickName: userInfo.nickName,
  avatarUrl: userInfo.avatarUrl,
  // 不存储 phoneNumber
};
wx.setStorageSync('userInfo', publicUserInfo);
```

### 云函数保护
```javascript
// updateUserInfo 云函数只返回公开信息
return {
  success: true,
  userInfo: publicUserInfo, // 不包含 phoneNumber
};
```

### 数据库查询保护
```javascript
// 查询用户信息时，不查询手机号字段
db.collection("users")
  .where({ _openid: openid })
  .field({ 
    nickName: true, 
    avatarUrl: true, 
    _openid: true,
    // 不查询 phoneNumber
  })
  .get()
```

## 🔑 后台管理

### 查看用户手机号

**方法1：云开发控制台**
1. 打开云开发控制台
2. 进入数据库
3. 打开 `users` 集合
4. 查看用户记录，可以看到 `phoneNumber` 字段

**方法2：调用管理云函数**
```javascript
// 调用 getUserInfoAdmin 云函数
wx.cloud.callFunction({
  name: 'getUserInfoAdmin',
  data: {
    targetOpenid: 'oXXXX-XXXXXXXXXXXX' // 目标用户的 openid
  }
})
.then(res => {
  console.log('用户信息:', res.result.data);
  console.log('手机号:', res.result.data.phoneNumber);
});
```

**返回数据：**
```javascript
{
  success: true,
  data: {
    _id: "xxx",
    _openid: "oXXXX-XXXXXXXXXXXX",
    nickName: "用户昵称",
    avatarUrl: "cloud://xxx.jpg",
    phoneNumber: "13800138000", // 手机号
    createTime: Date,
    updateTime: Date
  }
}
```

## 🎯 用户体验流程

### 未登录用户

**场景1：尝试发布帖子**
```
1. 点击底部"发布"标签
2. 点击"发布社区帖子"或"发布无障碍问题"
3. 弹出提示："发布帖子前需要先登录，是否前往登录？"
4. 点击"去登录" → 跳转到登录页面
5. 点击"取消" → 留在当前页面
```

**场景2：尝试查看消息**
```
1. 点击底部"消息"标签
2. 自动弹出提示："查看消息前需要先登录，是否前往登录？"
3. 点击"去登录" → 跳转到登录页面
4. 点击"取消" → 留在当前页面
```

### 登录流程

```
1. 进入登录页面
2. 选择头像
3. 输入昵称（2-20个字符）
4. 输入手机号（11位数字，必填）
5. 点击"完成"按钮
6. 系统验证：
   - 头像是否选择
   - 昵称是否填写
   - 手机号是否为11位
   - 手机号格式是否正确
7. 验证通过 → 上传头像 → 保存信息 → 登录成功
8. 验证失败 → 显示错误提示
```

## ⚠️ 注意事项

### 1. 手机号验证
- 必须是11位数字
- 第一位必须是1
- 第二位必须是3-9
- 示例：13800138000 ✅
- 示例：12345678901 ❌（第二位是2）
- 示例：1380013800 ❌（只有10位）

### 2. 隐私保护
- 手机号只存储在云数据库
- 前端无法获取手机号
- 用户无法看到别人的手机号
- 只有后台管理员可以查看

### 3. 登录限制
- 未登录无法发布内容
- 未登录无法查看消息
- 未登录可以浏览社区
- 所有限制都有友好提示

## 🚀 部署步骤

### 1. 部署云函数

```bash
# 在微信开发者工具中
1. 右键 cloudfunctions/updateUserInfo → 上传并部署
2. 右键 cloudfunctions/getUserInfoAdmin → 上传并部署
```

### 2. 更新数据库权限

```json
// users 集合权限设置
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

**说明：**
- 所有人可读（但查询时不返回手机号）
- 只有本人可写（只能修改自己的信息）

### 3. 测试功能

**测试1：登录流程**
- [ ] 不填手机号无法登录
- [ ] 手机号少于11位无法登录
- [ ] 手机号多于11位自动截断
- [ ] 手机号格式错误提示
- [ ] 填写正确信息可以登录

**测试2：发布限制**
- [ ] 未登录点击发布显示提示
- [ ] 点击"去登录"跳转到登录页
- [ ] 登录后可以正常发布

**测试3：消息限制**
- [ ] 未登录进入消息页显示提示
- [ ] 点击"去登录"跳转到登录页
- [ ] 登录后可以查看消息

**测试4：隐私保护**
- [ ] 本地 Storage 中没有手机号
- [ ] 查看别人资料看不到手机号
- [ ] 后台可以查看手机号

## 📊 数据统计

### 后台可以统计的数据

1. **用户总数**
```javascript
db.collection('users').count()
```

2. **按手机号查询用户**
```javascript
db.collection('users')
  .where({ phoneNumber: '13800138000' })
  .get()
```

3. **导出用户列表（含手机号）**
```javascript
db.collection('users')
  .field({ nickName: true, phoneNumber: true, createTime: true })
  .get()
```

## 🔧 常见问题

### Q1: 用户忘记手机号怎么办？
A: 用户无需记住手机号，手机号仅用于后台联系。

### Q2: 用户可以修改手机号吗？
A: 目前不支持修改手机号。如需修改，请联系后台管理员。

### Q3: 手机号会泄露吗？
A: 不会。手机号只存储在数据库，前端无法获取，用户无法看到别人的手机号。

### Q4: 后台如何联系用户？
A: 通过云开发控制台或调用 `getUserInfoAdmin` 云函数查看用户手机号。

### Q5: 可以不填手机号吗？
A: 不可以。手机号是必填项，不填无法完成登录。

---

**更新时间：** 2026-01-30
**版本：** v2.0
**状态：** ✅ 开发完成，待部署测试








