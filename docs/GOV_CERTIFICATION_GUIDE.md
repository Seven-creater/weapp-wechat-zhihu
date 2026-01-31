# 政府用户认证系统使用指南

## 📋 系统概述

政府用户认证系统用于验证政府部门工作人员的身份，确保只有真实的政府工作人员才能获得政府用户权限。

## 🔄 认证流程

### 1️⃣ 用户端：提交认证申请

**步骤：**
1. 用户在登录页面选择"政府/监管部门"身份
2. 填写必填信息：
   - 昵称
   - 头像
   - 手机号
   - 个人简介
   - **所属部门**（如：XX街道办事处）
   - **职位**（如：无障碍专员）
   - **工作证号**（用于认证）
3. 点击提交后，系统会：
   - 创建认证申请记录
   - 暂时将用户设置为普通用户
   - 显示"认证审核中"提示

**认证状态显示：**
- 在个人中心页面会显示黄色提示框："⏳ 政府认证审核中，请耐心等待..."

### 2️⃣ 管理员端：审核认证申请

**访问审核页面：**
```
路径：pages/admin-certification/index
```

**审核功能：**
1. **统计概览**
   - 待审核数量
   - 已通过数量
   - 已拒绝数量

2. **筛选查看**
   - 待审核申请
   - 已通过申请
   - 已拒绝申请

3. **审核操作**
   - **通过**：用户自动升级为政府用户，获得政府权限
   - **拒绝**：需填写拒绝原因，用户保持普通用户身份

### 3️⃣ 审核结果

**通过后：**
- 用户类型自动更新为 `government`
- 获得政府用户徽章（🔴 政府）
- 获得政府用户权限：
  - ✅ 可以核实问题
  - ✅ 可以创建官方项目
  - ✅ 可以发布政策
  - ✅ 可以查看用户联系方式
  - ✅ 可以监督施工进度
- 个人中心显示认证信息（部门、职位、工作证号）

**拒绝后：**
- 用户保持普通用户身份
- 可以查看拒绝原因
- 可以重新提交申请

## 🗄️ 数据库结构

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
  status: "pending|approved|rejected",
  applyTime: 1234567890,
  reviewTime: 1234567890,
  reviewerId: "审核人openid",
  rejectReason: "拒绝原因"
}
```

### users 集合（政府用户字段）

```javascript
{
  openid: "用户openid",
  userType: "government",
  certificationStatus: "approved",
  certificationTime: 1234567890,
  profile: {
    bio: "个人简介",
    department: "所属部门",
    position: "职位",
    workId: "工作证号"
  }
}
```

## ☁️ 云函数列表

### 1. applyGovCertification
**功能：** 提交政府用户认证申请

**参数：**
```javascript
{
  nickName: "用户昵称",
  avatarUrl: "头像URL",
  phoneNumber: "手机号",
  department: "所属部门",
  position: "职位",
  workId: "工作证号"
}
```

### 2. reviewGovCertification
**功能：** 审核政府用户认证申请

**参数：**
```javascript
{
  applicationId: "申请ID",
  status: "approved|rejected",
  rejectReason: "拒绝原因（拒绝时必填）"
}
```

### 3. getGovCertApplications
**功能：** 获取认证申请列表

**参数：**
```javascript
{
  status: "pending|approved|rejected",
  page: 1,
  pageSize: 20
}
```

### 4. getGovCertStats
**功能：** 获取认证申请统计数据

**返回：**
```javascript
{
  stats: {
    pending: 0,
    approved: 0,
    rejected: 0
  }
}
```

## 🔐 管理员权限设置

### 方法一：在云函数中硬编码管理员列表

在每个管理员云函数中添加：

```javascript
// 管理员 openid 列表
const ADMIN_OPENIDS = [
  'oXXXX-管理员1的openid',
  'oXXXX-管理员2的openid'
];

// 验证管理员权限
if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
  return {
    success: false,
    error: '权限不足'
  };
}
```

### 方法二：在数据库中设置管理员表

创建 `admins` 集合：

```javascript
{
  openid: "管理员openid",
  role: "super_admin|admin",
  permissions: ["review_certification", "manage_users"],
  createdAt: 1234567890
}
```

## 📱 页面路由

### 用户端
- 登录页面：`pages/login/index`
- 个人中心：`pages/mine/index`

### 管理员端
- 认证审核：`pages/admin-certification/index`

## 🚀 部署步骤

### 1. 上传云函数

```bash
# 进入云函数目录
cd cloudfunctions

# 上传以下云函数：
- applyGovCertification
- reviewGovCertification
- getGovCertApplications
- getGovCertStats
```

### 2. 创建数据库集合

在微信云开发控制台创建：
- `gov_certifications` 集合

### 3. 设置数据库权限

```json
{
  "read": "auth",
  "write": "auth"
}
```

### 4. 配置管理员

在云函数中添加管理员 openid 列表（见上文）

## 💡 使用建议

### 安全性
1. ✅ 管理员权限必须在云端验证，不能只在前端判断
2. ✅ 敏感信息（工作证号）应加密存储
3. ✅ 审核操作应记录日志，便于追溯

### 用户体验
1. ✅ 认证状态实时显示
2. ✅ 拒绝时必须说明原因
3. ✅ 支持重新提交申请

### 扩展功能
1. 📸 上传工作证照片
2. 📧 审核结果通知（模板消息）
3. 📊 审核记录查询
4. ⏰ 自动提醒管理员审核

## 🎯 测试流程

### 1. 测试提交申请
1. 清除缓存，重新登录
2. 选择"政府/监管部门"
3. 填写认证信息
4. 提交申请
5. 检查个人中心是否显示"审核中"

### 2. 测试审核功能
1. 访问审核页面
2. 查看待审核列表
3. 测试通过操作
4. 测试拒绝操作
5. 检查用户身份是否更新

### 3. 测试权限
1. 审核通过后，检查用户是否获得政府徽章
2. 测试政府用户专属功能
3. 验证权限控制是否生效

## 📞 常见问题

**Q: 如何成为管理员？**
A: 需要在云函数中配置管理员 openid 列表

**Q: 用户可以重复提交申请吗？**
A: 不可以，如果有待审核的申请，会提示"已有待审核的申请"

**Q: 审核通过后可以撤销吗？**
A: 需要手动在数据库中修改用户类型

**Q: 如何查看自己的 openid？**
A: 在小程序中调用 `wx.cloud.callFunction({ name: 'login' })` 获取

---

**创建时间：** 2026-01-30
**版本：** v1.0

