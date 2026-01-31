# 政府用户认证系统 - 问题修复总结

## 📋 已解决的问题

### 1️⃣ **管理员审核通过后，用户无法变成政府身份**

**问题原因：**
- 云函数更新用户信息时，可能用户记录不存在或更新失败

**解决方案：**
修改了 `cloudfunctions/reviewGovCertification/index.js`：
- ✅ 添加了用户存在性检查
- ✅ 先查询用户是否存在，再执行更新
- ✅ 添加详细的日志输出，便于调试
- ✅ 修正了 `profile.certificationStatus` 的更新路径

**关键代码：**
```javascript
// 先查询用户是否存在
const userQuery = await db.collection('users')
  .where({ openid: userOpenid })
  .get();

if (userQuery.data && userQuery.data.length > 0) {
  // 用户存在，更新用户信息
  await db.collection('users')
    .where({ openid: userOpenid })
    .update({
      data: {
        userType: 'government',
        'profile.department': application.data.department,
        'profile.position': application.data.position,
        'profile.workId': application.data.workId,
        'profile.certificationStatus': 'approved',
        certificationTime: Date.now()
      }
    });
}
```

---

### 2️⃣ **在登录界面就可以申请认证政府**

**解决方案：**
登录页面已经支持选择政府身份，当用户选择"政府/监管部门"时：

1. **填写认证信息**
   - 用户在登录页面可以直接看到"政府/监管部门"选项
   - 选择后会显示认证信息表单（部门、职位、工作证号）
   - 填写完整后提交

2. **提交流程**
   - 调用 `applyGovCertification` 云函数提交认证申请
   - 用户暂时保存为普通用户
   - 标记 `certificationStatus: 'pending'`
   - 等待管理员审核

3. **用户体验**
   - 提交后显示友好提示："您的政府用户认证申请已提交，请等待管理员审核"
   - 个人中心显示"⏳ 政府认证审核中"的黄色提示框

**相关文件：**
- `pages/login/index.wxml` - 登录页面UI
- `pages/login/index.js` - 提交认证申请逻辑
- `cloudfunctions/applyGovCertification/index.js` - 认证申请云函数

---

### 3️⃣ **管理员可以移除政府身份**

**解决方案：**

#### A. 创建移除云函数
新建 `cloudfunctions/removeGovCertification/`：
- ✅ 验证管理员权限
- ✅ 检查用户是否是政府用户
- ✅ 将用户身份改为普通用户
- ✅ 更新认证记录状态为 `removed`
- ✅ 记录移除时间和操作人

#### B. 审核页面添加移除按钮
修改 `pages/admin-certification/index.wxml`：
- ✅ 在"已通过"列表中，每个用户卡片显示"🗑️ 移除政府身份"按钮
- ✅ 按钮为橙色渐变，醒目但不突兀

#### C. 添加移除逻辑
修改 `pages/admin-certification/index.js`：
- ✅ 添加 `handleRemove()` 方法
- ✅ 点击时弹出确认对话框
- ✅ 确认后调用 `removeGovCertification` 云函数
- ✅ 移除成功后刷新列表

**使用方法：**
1. 管理员进入"认证审核"页面
2. 切换到"已通过"标签
3. 找到需要移除的用户
4. 点击"🗑️ 移除政府身份"按钮
5. 确认操作
6. 用户身份自动变为普通用户

---

## 🚀 部署步骤

### 1. 上传云函数

需要上传以下云函数：

```bash
# 必须上传（修改过的）
- reviewGovCertification (修复了用户身份更新问题)

# 新增的云函数
- removeGovCertification (移除政府身份功能)

# 其他相关云函数（如果还没上传）
- applyGovCertification (提交认证申请)
- getGovCertApplications (获取申请列表)
- getGovCertStats (获取统计数据)
```

**上传方法：**
在微信开发者工具中，右键点击云函数文件夹 → 上传并部署：云端安装依赖

### 2. 测试流程

#### 测试1：用户申请认证
1. 清除缓存，重新登录
2. 在登录页面选择"政府/监管部门"
3. 填写认证信息（部门、职位、工作证号）
4. 提交申请
5. 检查个人中心是否显示"审核中"提示

#### 测试2：管理员审核通过
1. 用管理员账号登录
2. 进入"我的"页面，点击"🔐 认证审核"
3. 在"待审核"列表中找到申请
4. 点击"✅ 通过"
5. 检查用户身份是否更新为政府用户
6. 检查用户个人中心是否显示政府徽章和认证信息

#### 测试3：移除政府身份
1. 管理员进入"认证审核"页面
2. 切换到"已通过"标签
3. 找到已通过的用户
4. 点击"🗑️ 移除政府身份"
5. 确认操作
6. 检查用户身份是否变回普通用户

---

## 📊 数据库字段说明

### users 集合（政府用户）
```javascript
{
  openid: "用户openid",
  userType: "government",  // 政府用户
  profile: {
    bio: "个人简介",
    department: "所属部门",
    position: "职位",
    workId: "工作证号",
    certificationStatus: "approved"  // 认证状态
  },
  certificationTime: 1234567890,  // 认证通过时间
  certificationRemovedTime: 1234567890,  // 移除时间（如果被移除）
  certificationRemovedBy: "管理员openid"  // 移除操作人
}
```

### gov_certifications 集合
```javascript
{
  _id: "申请ID",
  openid: "用户openid",
  nickName: "用户昵称",
  avatarUrl: "头像URL",
  phoneNumber: "手机号",
  department: "所属部门",
  position: "职位",
  workId: "工作证号",
  status: "pending|approved|rejected|removed",  // 新增 removed 状态
  applyTime: 1234567890,
  reviewTime: 1234567890,
  reviewerId: "审核人openid",
  rejectReason: "拒绝原因",
  removeTime: 1234567890,  // 移除时间
  removedBy: "移除操作人openid"  // 移除操作人
}
```

---

## 🎯 功能总结

### 用户端
- ✅ 登录时可以选择政府身份
- ✅ 填写认证信息（部门、职位、工作证号）
- ✅ 提交认证申请
- ✅ 查看认证状态（审核中/已通过/已拒绝）
- ✅ 审核通过后自动升级为政府用户
- ✅ 显示政府徽章和认证信息

### 管理员端
- ✅ 查看所有认证申请
- ✅ 按状态筛选（待审核/已通过/已拒绝）
- ✅ 审核通过/拒绝申请
- ✅ 移除已通过的政府身份
- ✅ 查看统计数据

### 权限控制
- ✅ 只有管理员可以访问审核页面
- ✅ 只有管理员可以审核申请
- ✅ 只有管理员可以移除政府身份
- ✅ 管理员 openid 在云函数中配置

---

## 🔧 故障排查

### 问题1：审核通过后用户身份没有更新
**检查步骤：**
1. 查看云函数日志，确认是否有错误
2. 检查用户是否存在于 `users` 集合
3. 确认云函数已重新上传

### 问题2：管理员看不到审核按钮
**检查步骤：**
1. 确认 openid 是否正确
2. 检查 `pages/mine/index.js` 中的 `ADMIN_OPENIDS`
3. 查看控制台日志："🔐 检查管理员权限"

### 问题3：移除按钮不显示
**检查步骤：**
1. 确认已切换到"已通过"标签
2. 确认列表中有已通过的申请
3. 检查云函数是否已上传

---

## 📝 注意事项

1. **管理员配置**
   - 所有云函数中的 `ADMIN_OPENIDS` 必须保持一致
   - 修改管理员列表后需要重新上传云函数

2. **数据一致性**
   - 审核通过后，`users` 表和 `gov_certifications` 表都会更新
   - 移除身份后，两个表的状态都会同步

3. **用户体验**
   - 所有操作都有确认对话框
   - 操作结果都有明确的提示
   - 审核状态实时显示

---

**创建时间：** 2026-01-31
**版本：** v2.0
**状态：** ✅ 所有问题已解决

