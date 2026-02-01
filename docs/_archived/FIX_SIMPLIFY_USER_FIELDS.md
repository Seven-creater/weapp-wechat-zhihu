# 简化用户信息字段修复

## 📝 需求说明

### 修改前的问题
- ❌ 登录时需要填写太多字段（所属组织、学校、专业、经验等）
- ❌ "我的"页面显示太多信息，显得杂乱
- ❌ 政府用户没有特殊的认证要求

### 修改后的效果
- ✅ **普通用户/设计者/施工方**：只需填写个人简介（可选）
- ✅ **政府用户**：必须填写认证信息（所属部门、职位、工作证号）
- ✅ "我的"页面只显示简介和徽章
- ✅ 政府用户显示认证信息

---

## 🔧 具体修改

### 1. 用户类型配置（`utils/userTypes.js`）

#### 设计者
```javascript
profileFields: []  // 🔧 删除所有自定义字段
```

#### 施工方
```javascript
profileFields: []  // 🔧 删除所有自定义字段
```

#### 政府
```javascript
profileFields: [
  // 🔧 只保留认证必填字段
  { key: 'department', label: '所属部门', placeholder: '如：XX街道办事处', required: true },
  { key: 'position', label: '职位', placeholder: '如：无障碍专员', required: true },
  { key: 'workId', label: '工作证号', placeholder: '用于认证', required: true }
]
```

---

### 2. 登录页面（`pages/login/`）

#### WXML 修改
```xml
<!-- 简化后的表单 -->
<view class="optional-section" wx:if="{{showProfileFields}}">
  <text class="section-label">补充信息</text>
  
  <!-- 个人简介（所有专业用户） -->
  <view class="form-item">
    <text class="label">个人简介 {{selectedType === 'government' ? '' : '（可选）'}}</text>
    <textarea placeholder="简单介绍一下自己..." bindinput="onBioInput"></textarea>
  </view>

  <!-- 政府认证信息（仅政府用户） -->
  <view wx:if="{{selectedType === 'government'}}">
    <view wx:for="{{selectedTypeConfig.profileFields}}" wx:key="key">
      <text class="label">{{item.label}} <text class="required">*</text></text>
      <input placeholder="{{item.placeholder}}" bindinput="onCustomFieldInput" data-key="{{item.key}}"/>
    </view>
  </view>
</view>
```

#### JS 修改
```javascript
// 删除的字段
- organization: '',     // ❌ 删除
- contactInfo: '',      // ❌ 删除

// 保留的字段
data: {
  bio: '',              // ✅ 个人简介
  customFields: {}      // ✅ 政府认证信息
}

// 保存时
profile: {
  bio,
  ...customFields  // 只有政府用户有值
}
```

---

### 3. "我的"页面（`pages/mine/`）

#### WXML 修改
```xml
<!-- 个人简介（所有用户） -->
<text class="user-bio" wx:if="{{userInfo.profile && userInfo.profile.bio}}">
  {{userInfo.profile.bio}}
</text>

<!-- 政府认证信息（仅政府用户） -->
<view class="user-extra-grid" wx:if="{{userInfo.userType === 'government'}}">
  <view class="extra-item" wx:if="{{userInfo.profile.department}}">
    <text class="extra-icon">🏛️</text>
    <text class="extra-text">{{userInfo.profile.department}}</text>
  </view>
  <view class="extra-item" wx:if="{{userInfo.profile.position}}">
    <text class="extra-icon">👔</text>
    <text class="extra-text">{{userInfo.profile.position}}</text>
  </view>
  <view class="extra-item" wx:if="{{userInfo.profile.workId}}">
    <text class="extra-icon">🆔</text>
    <text class="extra-text">{{userInfo.profile.workId}}</text>
  </view>
</view>
```

---

### 4. 切换身份页面（`pages/switch-identity/`）

#### WXML 修改
- 删除"所属组织"、"联系方式"输入框
- 只保留"个人简介"
- 政府用户显示认证信息输入框

#### JS 修改
```javascript
// 删除的方法
- onOrganizationInput()  // ❌ 删除
- onContactInput()       // ❌ 删除

// 保留的方法
- onBioInput()           // ✅ 保留
- onCustomFieldInput()   // ✅ 保留（政府认证）
```

---

## 📊 数据结构

### 普通用户/设计者/施工方
```javascript
{
  userInfo: { nickName, avatarUrl },
  userType: "designer",
  badge: { color, icon, text },
  profile: {
    bio: "我是一名设计师"  // 只有简介
  }
}
```

### 政府用户
```javascript
{
  userInfo: { nickName, avatarUrl },
  userType: "government",
  badge: { color, icon, text },
  profile: {
    bio: "负责无障碍改造工作",
    department: "XX街道办事处",  // 必填
    position: "无障碍专员",       // 必填
    workId: "123456"             // 必填
  }
}
```

---

## 🎯 最终效果

### 登录时

#### 普通用户/设计者/施工方
```
┌─────────────────────────────┐
│ 选择身份：[设计者]          │
│ 头像：[选择]                │
│ 昵称：张三                  │
│ 手机号：138****8000         │
│                             │
│ 补充信息（可选）            │
│ 个人简介：                  │
│ ┌─────────────────────┐    │
│ │ 我是一名设计师...   │    │
│ └─────────────────────┘    │
│                             │
│ [完成]                      │
└─────────────────────────────┘
```

#### 政府用户
```
┌─────────────────────────────┐
│ 选择身份：[政府]            │
│ 头像：[选择]                │
│ 昵称：李四                  │
│ 手机号：138****8000         │
│                             │
│ 补充信息（必填）            │
│ 个人简介：                  │
│ ┌─────────────────────┐    │
│ │ 负责无障碍改造...   │    │
│ └─────────────────────┘    │
│                             │
│ 所属部门 *：XX街道办事处    │
│ 职位 *：无障碍专员          │
│ 工作证号 *：123456          │
│                             │
│ ⚠️ 政府用户需要填写认证信息 │
│                             │
│ [完成]                      │
└─────────────────────────────┘
```

### "我的"页面

#### 设计者
```
┌─────────────────────────────┐
│ [头像]  张三 🟢设计者        │
│         我是一名设计师...    │
│                             │
│         [退出登录]          │
│         [切换身份]          │
└─────────────────────────────┘
```

#### 政府用户
```
┌─────────────────────────────┐
│ [头像]  李四 🔴政府          │
│         负责无障碍改造工作   │
│         🏛️ XX街道办事处      │
│         👔 无障碍专员        │
│         🆔 123456            │
│                             │
│         [退出登录]          │
│         [切换身份]          │
└─────────────────────────────┘
```

---

## 📋 修改文件清单

1. ✅ `utils/userTypes.js` - 删除自定义字段，政府添加认证字段
2. ✅ `pages/login/index.wxml` - 简化表单
3. ✅ `pages/login/index.js` - 删除不需要的字段
4. ✅ `pages/mine/index.wxml` - 只显示简介和政府认证信息
5. ✅ `pages/switch-identity/index.wxml` - 简化表单
6. ✅ `pages/switch-identity/index.js` - 删除不需要的字段

---

## 🧪 测试步骤

### 测试设计者
1. 退出登录，清除缓存
2. 重新登录，选择"设计者"
3. 填写个人简介（可选）
4. 点击"完成"
5. ✅ "我的"页面只显示简介

### 测试政府用户
1. 切换身份到"政府"
2. 必须填写：所属部门、职位、工作证号
3. 点击"确认切换"
4. ✅ "我的"页面显示认证信息

---

## 💡 设计理念

### 简化原则
- **普通用户**：零门槛，无需填写任何额外信息
- **专业用户**：只需简介，降低注册门槛
- **政府用户**：必须认证，确保身份真实性

### 隐私保护
- 删除"联系方式"字段，保护用户隐私
- 手机号仅后台可见，不公开显示
- 政府认证信息仅用于身份验证

### 用户体验
- 表单更简洁，填写更快速
- "我的"页面更清爽
- 政府用户有明确的认证要求

---

**修改日期：** 2026年1月30日  
**修改文件：** 6个文件  
**状态：** ✅ 已完成

