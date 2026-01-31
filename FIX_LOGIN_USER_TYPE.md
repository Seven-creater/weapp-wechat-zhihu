# 登录时用户类型未保存问题修复

## 🐛 问题描述

用户在登录时选择了"设计者"身份并填写了所有补充信息，但登录后：
1. ❌ 显示为"普通用户"
2. ❌ 没有显示"设计者"徽章
3. ❌ 补充信息全部丢失

## 🔍 问题原因

**文件：** `pages/login/index.js`

在 `saveUserInfo` 方法中，虽然正确地将 `userType` 和 `profile` 传递给了云函数，但是：

1. **返回值问题**：`resolve(userInfo)` 返回的是传入的参数，而不是云函数返回的完整数据
2. **缺少字段**：云函数返回了 `userType` 和 `badge`，但没有被使用
3. **本地缓存不完整**：保存到本地缓存时缺少 `profile` 字段

```javascript
// 问题代码
saveUserInfo: function (userInfo) {
  return wx.cloud.callFunction({
    name: 'updateUserInfo',
    data: {
      userType: userInfo.userType,  // ✅ 传递了
      profile: userInfo.profile      // ✅ 传递了
    }
  }).then((res) => {
    if (res.result && res.result.success) {
      resolve(userInfo);  // ❌ 返回的是传入的参数，没有 badge
    }
  });
}

// 本地缓存
const publicUserInfo = {
  nickName: userInfo.nickName,
  avatarUrl: userInfo.avatarUrl,
  userType: userInfo.userType,  // ✅ 有
  badge: userInfo.badge,        // ❌ undefined（因为传入的 userInfo 没有 badge）
  // ❌ 缺少 profile
};
```

## ✅ 修复方案

### 修复 `saveUserInfo` 方法

**文件：** `pages/login/index.js`

```javascript
saveUserInfo: function (userInfo) {
  return new Promise((resolve, reject) => {
    console.log('🔍 准备保存用户信息:', userInfo);
    
    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        phoneNumber: userInfo.phoneNumber,
        userType: userInfo.userType,
        profile: userInfo.profile
      },
    })
    .then((res) => {
      console.log('✅ 云函数返回结果:', res.result);
      
      if (res.result && res.result.success) {
        // 🔧 使用云函数返回的完整信息
        const savedUserInfo = {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          userType: res.result.userType || userInfo.userType,  // ✅ 使用云函数返回的
          badge: res.result.badge || null,                     // ✅ 使用云函数返回的
          profile: userInfo.profile                            // ✅ 包含 profile
        };
        
        console.log('✅ 保存成功，完整信息:', savedUserInfo);
        resolve(savedUserInfo);  // ✅ 返回完整信息
      } else {
        reject(new Error(res.result?.error || '保存失败'));
      }
    });
  });
}
```

### 修复本地缓存

```javascript
.then((userInfo) => {
  // userInfo 现在包含完整信息：nickName, avatarUrl, userType, badge, profile
  
  const publicUserInfo = {
    nickName: userInfo.nickName,
    avatarUrl: userInfo.avatarUrl,
    userType: userInfo.userType,  // ✅ 从云函数返回
    badge: userInfo.badge,        // ✅ 从云函数返回
    profile: userInfo.profile     // ✅ 包含补充信息
  };
  
  console.log('✅ 保存到本地缓存:', publicUserInfo);
  
  app.globalData.userInfo = publicUserInfo;
  wx.setStorageSync('userInfo', publicUserInfo);
});
```

## 📋 修复后的数据流

### 1. 用户填写信息
```javascript
{
  nickName: "垫底的腰...",
  avatarUrl: "cloud://xxx.jpg",
  phoneNumber: "13800138000",
  selectedType: "designer",  // ✅ 选择了设计者
  bio: "我是一名设计师",
  organization: "学校",
  customFields: {
    school: "长沙理工大学",
    major: "设计学",
    experience: "0"
  }
}
```

### 2. 调用云函数
```javascript
wx.cloud.callFunction({
  name: 'updateUserInfo',
  data: {
    nickName: "垫底的腰...",
    avatarUrl: "cloud://xxx.jpg",
    phoneNumber: "13800138000",
    userType: "designer",      // ✅ 传递
    profile: {                 // ✅ 传递
      bio: "我是一名设计师",
      organization: "学校",
      school: "长沙理工大学",
      major: "设计学",
      experience: "0"
    }
  }
})
```

### 3. 云函数返回
```javascript
{
  success: true,
  userType: "designer",        // ✅ 返回
  badge: {                     // ✅ 返回
    color: "#10B981",
    icon: "🟢",
    text: "设计者"
  }
}
```

### 4. 保存到本地
```javascript
{
  nickName: "垫底的腰...",
  avatarUrl: "cloud://xxx.jpg",
  userType: "designer",        // ✅ 保存
  badge: {                     // ✅ 保存
    color: "#10B981",
    icon: "🟢",
    text: "设计者"
  },
  profile: {                   // ✅ 保存
    bio: "我是一名设计师",
    organization: "学校",
    school: "长沙理工大学",
    major: "设计学",
    experience: "0"
  }
}
```

## 🧪 测试步骤

1. **退出登录**
   - 点击"退出登录"
   - 清除小程序缓存

2. **重新登录**
   - 点击"登录"
   - 选择"设计者"身份
   - 填写个人简介
   - 填写所属组织
   - 填写学校、专业、经验
   - 点击"完成"

3. **查看控制台日志**
   ```
   🔍 准备保存用户信息: { userType: "designer", profile: {...} }
   ✅ 云函数返回结果: { success: true, userType: "designer", badge: {...} }
   ✅ 保存成功，完整信息: { userType: "designer", badge: {...}, profile: {...} }
   ✅ 保存到本地缓存: { userType: "designer", badge: {...}, profile: {...} }
   ```

4. **验证结果**
   - ✅ "我的"页面显示"设计者"徽章
   - ✅ 显示个人简介
   - ✅ 显示学校、专业等信息

## 📝 相关云函数

确保以下云函数已正确上传：

1. **updateUserInfo** - 保存用户信息
   - 必须返回 `userType` 和 `badge`
   
2. **getUserInfo** - 获取用户信息
   - 必须返回 `userType`、`badge`、`profile`

## ⚠️ 注意事项

1. **必须上传云函数**：
   - `updateUserInfo`（已修复）
   - `getUserInfo`（已修复）

2. **清除缓存测试**：
   - 测试前清除小程序缓存
   - 确保使用最新的代码

3. **查看日志**：
   - 打开调试模式
   - 查看控制台日志
   - 确认数据正确传递和返回

## 🎯 修复效果

- ✅ 登录时选择的身份正确保存
- ✅ 徽章信息正确显示
- ✅ 补充信息完整保存
- ✅ 本地缓存包含完整数据
- ✅ "我的"页面正确显示所有信息

---

**修复日期：** 2026年1月30日  
**修复文件：** `pages/login/index.js`  
**状态：** ✅ 已修复

