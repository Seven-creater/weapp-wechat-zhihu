# 🔄 政府身份改为社区工作者 - 修改总结

## ✅ 已完成的修改

### 1. 用户类型配置 (`utils/userTypes.js`)
- ✅ 将 `government` 改为 `communityWorker`
- ✅ 标签：`政府/监管部门` → `社区工作者`
- ✅ 徽章：`🔴 政府` → `🔴 社区工作者`
- ✅ 描述：`监督管理，推进项目，发布政策` → `服务社区，推进项目，协调资源`
- ✅ 认证字段：
  - `department`（所属部门）→ `community`（所属社区）
  - `position`（职位）保持不变
  - `workId`（工作证号）保持不变

### 2. 登录页面 (`pages/login/`)
- ✅ `index.js`：
  - `submitGovCertification()` → `submitCommunityWorkerCertification()`
  - 云函数调用：`applyGovCertification` → `applyCommunityWorkerCertification`
  - 提示文案：`政府用户认证` → `社区工作者认证`
  
- ✅ `index.wxml`：
  - 认证信息提示：`政府用户需要填写认证信息` → `社区工作者需要填写认证信息`
  - 表单字段判断：`selectedType === 'government'` → `selectedType === 'communityWorker'`

### 3. "我的"页面 (`pages/mine/`)
- ✅ `index.wxml`：
  - 认证信息显示：`userType === 'government'` → `userType === 'communityWorker'`
  - 图标：`🏛️ 所属部门` → `🏘️ 所属社区`
  - 字段：`profile.department` → `profile.community`
  - 提示文案：`政府认证审核中` → `社区工作者认证审核中`

### 4. 用户资料页面 (`pages/user-profile/`)
- ✅ `index.wxml`：
  - 认证信息显示：`userType === 'government'` → `userType === 'communityWorker'`
  - 图标：`🏛️ 所属部门` → `🏘️ 所属社区`
  - 字段：`profile.department` → `profile.community`

### 5. 管理员审核页面 (`pages/admin-certification/`)
- ✅ `index.js`：
  - 云函数调用全部更新：
    - `getGovCertStats` → `getCommunityWorkerCertStats`
    - `getGovCertApplications` → `getCommunityWorkerCertApplications`
    - `reviewGovCertification` → `reviewCommunityWorkerCertification`
    - `removeGovCertification` → `removeCommunityWorkerCertification`
  - 提示文案：`政府用户认证` → `社区工作者认证`
  
- ✅ `index.wxml`：
  - 标题：`政府用户认证审核` → `社区工作者认证审核`
  - 副标题：`审核政府部门工作人员` → `审核社区工作者`
  - 认证信息：`🏛️ 所属部门` → `🏘️ 所属社区`
  - 字段：`item.department` → `item.community`
  - 按钮文案：`移除政府身份` → `移除社区工作者身份`

### 6. 云函数（新建）
创建了5个新的云函数：

#### ✅ `applyCommunityWorkerCertification`
- 功能：提交社区工作者认证申请
- 数据库集合：`community_worker_certifications`
- 字段：`community`, `position`, `workId`

#### ✅ `getCommunityWorkerCertApplications`
- 功能：获取社区工作者认证申请列表
- 支持分页和状态筛选

#### ✅ `getCommunityWorkerCertStats`
- 功能：获取社区工作者认证统计数据
- 返回：待审核、已通过、已拒绝的数量

#### ✅ `reviewCommunityWorkerCertification`
- 功能：审核社区工作者认证申请
- 审核通过后自动更新用户身份为 `communityWorker`
- 设置徽章：`🔴 社区工作者`

#### ✅ `removeCommunityWorkerCertification`
- 功能：移除社区工作者身份
- 将用户降级为普通用户

## 📊 数据库变更

### 新增集合
- `community_worker_certifications`（社区工作者认证申请）
  - `openid`：申请人 openid
  - `nickName`：昵称
  - `avatarUrl`：头像
  - `phoneNumber`：手机号
  - `community`：所属社区（新字段，替代 department）
  - `position`：职位
  - `workId`：工作证号
  - `status`：状态（pending/approved/rejected）
  - `applyTime`：申请时间
  - `reviewTime`：审核时间
  - `reviewerId`：审核人 openid
  - `rejectReason`：拒绝原因

### 用户表字段变更
- `userType`：新增 `communityWorker` 类型
- `profile.community`：所属社区（新字段，替代 department）
- `profile.position`：职位
- `profile.workId`：工作证号

## 🎯 用户类型对比

| 项目 | 政府（旧） | 社区工作者（新） |
|------|-----------|----------------|
| ID | `government` | `communityWorker` |
| 标签 | 政府/监管部门 | 社区工作者 |
| 徽章 | 🔴 政府 | 🔴 社区工作者 |
| 认证字段1 | 所属部门 | 所属社区 |
| 认证字段2 | 职位 | 职位 |
| 认证字段3 | 工作证号 | 工作证号 |
| 需要认证 | ✅ | ✅ |
| 权限 | 相同 | 相同 |

## 📝 后续操作

### 1. 上传云函数
需要上传以下5个新云函数到微信云开发：
```bash
# 在微信开发者工具中，右键点击以下云函数文件夹，选择"上传并部署"
- applyCommunityWorkerCertification
- getCommunityWorkerCertApplications
- getCommunityWorkerCertStats
- reviewCommunityWorkerCertification
- removeCommunityWorkerCertification
```

### 2. 数据库权限配置
在云开发控制台配置数据库权限：
- 集合名：`community_worker_certifications`
- 权限：仅创建者及管理员可读写

### 3. 测试流程
1. **申请认证**：
   - 登录页面选择"社区工作者"
   - 填写：所属社区、职位、工作证号
   - 提交申请

2. **管理员审核**：
   - 管理员进入"认证审核"页面
   - 查看待审核申请
   - 通过或拒绝申请

3. **验证身份**：
   - 审核通过后，用户身份自动变为"社区工作者"
   - 显示红色徽章：🔴 社区工作者
   - 个人主页显示认证信息

### 4. 数据迁移（可选）
如果已有政府用户数据，需要迁移：
```javascript
// 在云函数中执行
db.collection('gov_certifications')
  .get()
  .then(res => {
    // 将数据复制到 community_worker_certifications
    // 字段映射：department → community
  });

db.collection('users')
  .where({ userType: 'government' })
  .update({
    data: {
      userType: 'communityWorker',
      'badge.text': '社区工作者',
      'profile.community': _.rename('profile.department')
    }
  });
```

## ⚠️ 注意事项

1. **旧数据兼容**：
   - 如果有旧的 `government` 用户，需要手动迁移
   - 或者保留 `government` 类型，同时支持 `communityWorker`

2. **云函数权限**：
   - 确保管理员 openid 正确配置
   - 当前管理员：`oOJhu3QmRKlk8Iuu87G6ol0IrDyQ`

3. **数据库集合**：
   - 新集合 `community_worker_certifications` 需要手动创建
   - 或者第一次申请时自动创建

4. **徽章颜色**：
   - 保持红色 `#EF4444`，与原政府身份一致
   - 如需区分，可以修改颜色

## 🎉 完成状态

- ✅ 前端页面修改完成
- ✅ 云函数创建完成
- ✅ 配置文件更新完成
- ⏳ 待上传云函数
- ⏳ 待测试完整流程

---

**修改完成时间**：2026-02-01
**修改内容**：将政府身份改为社区工作者身份
**影响范围**：用户类型、认证流程、管理员审核

