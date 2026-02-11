# 無界营造 - 云函数 API 文档

## 📡 云函数接口列表

---

## 一、用户认证相关

### 1. applyCertification - 提交角色认证申请

**功能**: 用户申请成为设计者、施工方或社区工作者

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'applyCertification',
  data: {
    nickName: string,        // 用户昵称
    avatarUrl: string,       // 用户头像
    userType: string,        // 申请的角色类型
    certificationInfo: object // 认证信息
  }
})
```

**参数说明**:
- `userType`: 'designer' | 'contractor' | 'communityWorker'
- `certificationInfo`: 根据不同角色包含不同字段

**设计者认证信息**:
```javascript
{
  organization: '长沙理工大学建筑学院',
  title: '在读研究生',
  expertise: '无障碍设计'
}
```

**施工方认证信息**:
```javascript
{
  companyName: '邵东市第一建筑公司',
  contactPerson: '张师傅',
  contactPhone: '13800138000',
  serviceArea: '长沙市、邵阳市',
  specialties: '无障碍坡道、无障碍卫生间'
}
```

**社区工作者认证信息**:
```javascript
{
  community: 'XX社区居委会',
  position: '社区主任',
  workId: 'GZ202401001'
}
```

**返回值**:
```javascript
{
  success: true,
  message: '认证申请已提交，请等待审核'
}
```

---

### 2. reviewCertification - 审核认证申请

**功能**: 管理员审核用户的角色认证申请

**权限**: 仅管理员

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'reviewCertification',
  data: {
    applicationId: string,  // 申请ID（用户_id）
    status: string,         // 'approved' | 'rejected'
    rejectReason: string    // 拒绝原因（status为rejected时必填）
  }
})
```

**返回值**:
```javascript
{
  success: true,
  message: '审核通过' // 或 '已拒绝申请'
}
```

---

### 3. getCertificationApplications - 获取认证申请列表

**功能**: 获取所有角色的认证申请列表

**权限**: 仅管理员

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'getCertificationApplications',
  data: {
    status: string,    // 'pending' | 'approved' | 'rejected'
    page: number,      // 页码，默认1
    pageSize: number,  // 每页数量，默认20
    userType: string   // 可选，筛选角色类型
  }
})
```

**返回值**:
```javascript
{
  success: true,
  applications: [
    {
      _id: 'user_xxx',
      _openid: 'oXXX',
      nickName: '张三',
      avatarUrl: 'https://...',
      userType: 'designer',
      userTypeLabel: '设计者',
      certificationInfo: { ... },
      status: 'pending',
      applyTime: 1706745600000,
      reviewTime: null,
      rejectReason: null
    }
  ],
  total: 10,
  hasMore: false
}
```

---

### 4. getCertificationStats - 获取认证统计数据

**功能**: 获取认证申请的统计数据

**权限**: 仅管理员

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'getCertificationStats',
  data: {}
})
```

**返回值**:
```javascript
{
  success: true,
  stats: {
    pending: 5,      // 待审核数量
    approved: 20,    // 已通过数量
    rejected: 3,     // 已拒绝数量
    byRole: {
      designer: 8,
      contractor: 10,
      communityWorker: 2
    }
  }
}
```

---

## 二、帖子状态流转相关

### 5. addDesignerSolution - 设计者添加方案

**功能**: 设计者为帖子添加优化设计方案

**权限**: 仅设计者

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'addDesignerSolution',
  data: {
    postId: string,           // 帖子ID
    optimizedPlan: string,    // 优化方案描述
    drawings: [string],       // 设计图纸（云存储URL）
    optimizedCost: number,    // 优化后的预算
    improvements: [string]    // 改进点列表
  }
})
```

**示例**:
```javascript
wx.cloud.callFunction({
  name: 'addDesignerSolution',
  data: {
    postId: 'post_xxx',
    optimizedPlan: '建议采用铝合金材质，坡度调整为1:12，符合GB50763规范...',
    drawings: ['cloud://design1.jpg', 'cloud://design2.jpg'],
    optimizedCost: 4800,
    improvements: ['材料优化', '工期缩短', '成本降低']
  }
})
```

**返回值**:
```javascript
{
  success: true,
  message: '设计方案已添加',
  solution: {
    designerId: 'oXXX',
    designerName: '李工',
    designerOrg: '长沙理工大学建筑学院',
    addedAt: '2026-02-01T10:30:00.000Z',
    optimizedPlan: '...',
    drawings: [...],
    optimizedCost: 4800,
    improvements: [...],
    likes: 0,
    isSelected: false
  }
}
```

---

### 6. createConstructionProject - 创建施工项目

**功能**: 施工方接单，创建施工项目

**权限**: 仅施工方

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'createConstructionProject',
  data: {
    postId: string  // 帖子ID
  }
})
```

**返回值**:
```javascript
{
  success: true,
  message: '施工项目已创建',
  projectId: 'project_xxx'
}
```

**副作用**:
- 创建 `construction_projects` 记录
- 更新帖子状态为 `in_progress`
- 记录施工方信息到帖子

---

### 7. updateConstructionProgress - 更新施工进度

**功能**: 施工方更新施工进度，添加里程碑

**权限**: 施工方（该项目）或社区工作者

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'updateConstructionProgress',
  data: {
    projectId: string,    // 项目ID
    progress: number,     // 进度百分比 (0-100)
    milestone: string,    // 里程碑描述
    photos: [string],     // 进度照片（云存储URL）
    notes: string         // 备注说明
  }
})
```

**示例**:
```javascript
wx.cloud.callFunction({
  name: 'updateConstructionProgress',
  data: {
    projectId: 'project_xxx',
    progress: 50,
    milestone: '坡道浇筑完成',
    photos: ['cloud://progress1.jpg', 'cloud://progress2.jpg'],
    notes: '混凝土已浇筑，等待养护48小时'
  }
})
```

**返回值**:
```javascript
{
  success: true,
  message: '施工进度已更新',
  progress: 50,
  milestone: {
    stage: '坡道浇筑完成',
    completedAt: '2026-02-01T14:30:00.000Z',
    photos: [...],
    notes: '...',
    updatedBy: 'oXXX',
    updatedByName: '张师傅'
  }
}
```

**副作用**:
- 添加里程碑到 `construction_projects.milestones`
- 更新 `construction_projects.progress`
- 同步更新帖子中的进度信息
- 如果进度达到100%，自动标记项目为完成

---

### 8. confirmCompletion - 确认项目完工

**功能**: 发帖者或社区工作者确认项目完工

**权限**: 发帖者或社区工作者

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'confirmCompletion',
  data: {
    postId: string,         // 帖子ID
    afterImages: [string],  // 完工照片（云存储URL）
    feedback: string,       // 验收反馈
    rating: number          // 评分 (1-5)
  }
})
```

**示例**:
```javascript
wx.cloud.callFunction({
  name: 'confirmCompletion',
  data: {
    postId: 'post_xxx',
    afterImages: ['cloud://after1.jpg', 'cloud://after2.jpg'],
    feedback: '改造效果很好，轮椅可以顺利通行了，感谢施工方的专业施工！',
    rating: 5
  }
})
```

**返回值**:
```javascript
{
  success: true,
  message: '项目已确认完工，已移至案例库',
  completion: {
    confirmedBy: 'oXXX',
    confirmedByType: 'normal',
    confirmedByName: '张三',
    confirmedAt: '2026-02-01T16:00:00.000Z',
    afterImages: [...],
    feedback: '...',
    rating: 5
  }
}
```

**副作用**:
- 更新帖子状态为 `completed`
- 设置 `isCase = true`（自动移至案例库）
- 更新施工项目状态为 `completed`
- 记录完工验收信息

---

## 三、错误码说明

### 通用错误码

| 错误信息 | 说明 | 解决方法 |
|---------|------|---------|
| 参数错误 | 缺少必填参数 | 检查传入的参数是否完整 |
| 用户不存在 | 未找到用户记录 | 确认用户已登录 |
| 权限不足 | 没有操作权限 | 检查用户角色和权限 |

### 认证相关错误

| 错误信息 | 说明 | 解决方法 |
|---------|------|---------|
| 请填写完整的认证信息 | 认证字段不完整 | 补充必填字段 |
| 您已有待审核的申请 | 重复提交申请 | 等待审核结果 |
| 仅管理员可以审核 | 非管理员调用审核接口 | 配置管理员openid |

### 帖子状态相关错误

| 错误信息 | 说明 | 解决方法 |
|---------|------|---------|
| 仅设计者可以添加设计方案 | 非设计者调用 | 先申请设计者认证 |
| 该帖子已有施工方接单 | 帖子状态不是pending | 选择其他帖子 |
| 无权限更新此项目 | 不是该项目的施工方 | 检查项目归属 |
| 仅发帖者或社区工作者可以确认完工 | 权限不足 | 联系发帖者或社区工作者 |

---

## 四、数据库集合说明

### users 集合
- **用途**: 存储用户信息和认证申请
- **索引**: `_openid`, `userType`, `certificationApplication.status`

### posts 集合
- **用途**: 存储帖子信息和状态
- **索引**: `status`, `isCase`, `category`, `createTime`

### construction_projects 集合
- **用途**: 存储施工项目信息
- **索引**: `status`, `constructorId`, `postId`

---

## 五、最佳实践

### 1. 错误处理

```javascript
wx.cloud.callFunction({
  name: 'addDesignerSolution',
  data: { ... }
}).then(res => {
  if (res.result && res.result.success) {
    wx.showToast({
      title: '操作成功',
      icon: 'success'
    });
  } else {
    wx.showToast({
      title: res.result?.error || '操作失败',
      icon: 'none'
    });
  }
}).catch(err => {
  console.error('云函数调用失败:', err);
  wx.showToast({
    title: '网络错误，请重试',
    icon: 'none'
  });
});
```

### 2. 权限检查

在调用云函数前，先在前端检查权限：

```javascript
const permission = require('../../utils/permission.js');

// 检查是否可以添加设计方案
if (!permission.canAddDesignSolution(post)) {
  wx.showToast({
    title: '您没有权限添加设计方案',
    icon: 'none'
  });
  return;
}

// 调用云函数
wx.cloud.callFunction({ ... });
```

### 3. 图片上传

先上传图片到云存储，再调用云函数：

```javascript
// 1. 选择图片
wx.chooseImage({
  count: 3,
  success: (res) => {
    const tempFilePaths = res.tempFilePaths;
    
    // 2. 上传到云存储
    const uploads = tempFilePaths.map((path, index) => {
      const cloudPath = `designs/${Date.now()}-${index}.jpg`;
      return wx.cloud.uploadFile({
        cloudPath,
        filePath: path
      }).then(res => res.fileID);
    });
    
    // 3. 等待所有图片上传完成
    Promise.all(uploads).then(fileIDs => {
      // 4. 调用云函数
      wx.cloud.callFunction({
        name: 'addDesignerSolution',
        data: {
          postId: 'post_xxx',
          drawings: fileIDs,
          // ... 其他参数
        }
      });
    });
  }
});
```

---

## 六、调试技巧

### 1. 查看云函数日志

在微信开发者工具中：
1. 点击"云开发"
2. 选择"云函数"
3. 点击对应的云函数
4. 查看"日志"标签

### 2. 本地调试

```javascript
// 在云函数中添加详细日志
console.log('📥 接收到的参数:', event);
console.log('👤 当前用户:', openid);
console.log('✅ 操作成功');
console.log('❌ 操作失败:', err);
```

### 3. 数据库查询

在云开发控制台中，可以直接查询数据库：

```javascript
// 查询某个用户的认证申请
db.collection('users')
  .where({ _openid: 'oXXX' })
  .get()
```

---

## 🎉 总结

本文档涵盖了無界营造小程序的所有核心云函数接口。

**重要提示**:
- 所有云函数都需要用户登录（有openid）
- 部分云函数需要特定角色权限
- 建议在前端先检查权限，再调用云函数
- 注意处理错误情况，提供友好的用户提示

如有疑问，请查看：
- 📖 开发进度报告.md
- 🚀 快速使用指南.md
- 💻 云函数源代码

---

**最后更新**: 2026-02-01



