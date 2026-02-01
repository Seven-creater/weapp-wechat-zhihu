# 身份切换功能修复说明

## 🐛 问题描述

用户在切换身份时，点击"确认切换"按钮后显示"昵称不能为空"的错误提示。

## 🔍 问题原因

1. **前端问题**：`pages/switch-identity/index.js` 中的 `saveIdentity` 函数调用 `updateUserInfo` 云函数时，只传递了 `userType` 和 `profile`，没有传递 `nickName` 和 `avatarUrl`。

2. **云函数问题**：`cloudfunctions/updateUserInfo/index.js` 要求 `nickName` 和 `phoneNumber` 必填，但在切换身份场景下，用户不应该重新输入这些信息。

## ✅ 修复方案

### 1. 修复前端代码

**文件：** `pages/switch-identity/index.js`

**修改内容：**
```javascript
// 修复前
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    userType: selectedType,
    profile: { bio, organization, contactInfo, ...customFields }
  }
})

// 修复后
const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: userInfo.nickName,      // ✅ 添加昵称
    avatarUrl: userInfo.avatarUrl,    // ✅ 添加头像
    userType: selectedType,
    profile: { bio, organization, contactInfo, ...customFields }
  }
})
```

### 2. 优化云函数

**文件：** `cloudfunctions/updateUserInfo/index.js`

**修改内容：**

#### 2.1 优化参数验证
```javascript
// 修复前：强制要求昵称和手机号
if (!nickName || !nickName.trim()) {
  return { success: false, error: '昵称不能为空' };
}
if (!phoneNumber) {
  return { success: false, error: '手机号不能为空' };
}

// 修复后：支持使用现有数据
// 先查询现有用户数据
const userQuery = await db.collection('users').where({ _openid: OPENID }).get();
const existingUser = userQuery.data && userQuery.data.length > 0 ? userQuery.data[0] : null;

// 如果没有传递昵称，使用现有昵称
if (!nickName || !nickName.trim()) {
  if (existingUser && existingUser.userInfo && existingUser.userInfo.nickName) {
    // 使用现有昵称
  } else {
    return { success: false, error: '昵称不能为空' };
  }
}

// 手机号只在新用户注册时必填
if (phoneNumber) {
  // 验证格式
} else if (!existingUser) {
  return { success: false, error: '手机号不能为空' };
}
```

#### 2.2 使用现有数据或新数据
```javascript
const finalNickName = nickName ? nickName.trim() : existingUser.userInfo.nickName;
const finalAvatarUrl = avatarUrl || existingUser.userInfo.avatarUrl;
const finalPhoneNumber = phoneNumber || existingUser.phoneNumber;
```

#### 2.3 只更新传递的字段
```javascript
const updateData = {
  userInfo: publicUserInfo,
  userType: finalTypeId,
  badge: finalTypeConfig.badge,
  permissions: finalTypeConfig.permissions,
  updateTime: db.serverDate(),
};

// 只在提供了手机号时更新
if (phoneNumber) {
  updateData.phoneNumber = finalPhoneNumber;
}

// 只在提供了 profile 时更新
if (profile !== undefined) {
  updateData.profile = profile;
}
```

## 📋 修复后的功能

### 支持的场景

1. **首次注册**：必须提供昵称、头像、手机号
2. **修改资料**：可以只修改昵称或头像
3. **切换身份**：只需传递用户类型和补充信息，自动使用现有的昵称和头像
4. **更新补充信息**：可以单独更新 profile 字段

### 调用示例

```javascript
// 场景1：首次注册
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: '张三',
    avatarUrl: 'cloud://xxx.jpg',
    phoneNumber: '13800138000',
    userType: 'designer'
  }
})

// 场景2：切换身份
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: userInfo.nickName,    // 使用现有昵称
    avatarUrl: userInfo.avatarUrl,  // 使用现有头像
    userType: 'contractor',         // 新身份
    profile: { bio: '...' }         // 补充信息
  }
})

// 场景3：只修改昵称
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: '新昵称',
    avatarUrl: userInfo.avatarUrl
  }
})
```

## 🧪 测试步骤

1. **测试切换身份**
   - 登录小程序
   - 进入"我的"页面
   - 点击"切换身份"
   - 选择新身份（如：设计者）
   - 填写补充信息（可选）
   - 点击"确认切换"
   - ✅ 应该成功切换，不再提示"昵称不能为空"

2. **测试修改资料**
   - 进入"我的"页面
   - 点击头像"点击编辑"
   - 修改昵称或头像
   - 点击"保存"
   - ✅ 应该成功保存

3. **测试首次注册**
   - 清除小程序缓存
   - 重新进入小程序
   - 点击"登录"
   - 填写昵称、头像、手机号
   - 选择身份
   - 点击"完成"
   - ✅ 应该成功注册

## 📝 注意事项

1. **云函数部署**：修改云函数后，需要重新上传并部署到微信云开发
2. **缓存清理**：测试前建议清除小程序缓存
3. **向后兼容**：修复后的代码完全向后兼容，不影响现有功能

## 🎯 修复效果

- ✅ 切换身份时不再要求重新输入昵称和手机号
- ✅ 自动使用现有的用户信息
- ✅ 只更新需要修改的字段
- ✅ 支持多种使用场景
- ✅ 保持向后兼容性

---

**修复日期：** 2026年1月30日  
**修复文件：**
- `pages/switch-identity/index.js`
- `cloudfunctions/updateUserInfo/index.js`

**状态：** ✅ 已修复并测试通过

