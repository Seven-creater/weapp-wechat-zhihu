# 三类用户体系 - 快速部署指南

## 📋 部署前检查清单

- [ ] 已安装微信开发者工具
- [ ] 已开通微信云开发
- [ ] 已配置云开发环境
- [ ] 已备份现有数据库

---

## 🚀 部署步骤

### 步骤 1：上传云函数

#### 1.1 上传新云函数

在微信开发者工具中，右键点击以下云函数文件夹，选择"上传并部署：云端安装依赖"：

```
cloudfunctions/verifyIssue/          # 核实问题
cloudfunctions/getUserContact/       # 获取联系方式
```

#### 1.2 更新现有云函数

右键点击以下云函数，选择"上传并部署：云端安装依赖"：

```
cloudfunctions/updateUserInfo/       # 更新用户信息（已修改）
```

**预计时间：** 5-10 分钟

---

### 步骤 2：数据库迁移（可选）

如果已有用户数据，需要为现有用户添加默认字段。

#### 方案 A：自动迁移（推荐）

创建并运行数据迁移云函数：

```javascript
// cloudfunctions/migrateUsers/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 获取所有没有 userType 的用户
    const users = await db.collection('users')
      .where({
        userType: db.command.exists(false)
      })
      .get();
    
    // 批量更新
    const tasks = users.data.map(user => {
      return db.collection('users').doc(user._id).update({
        data: {
          userType: 'normal',
          badge: {
            color: '#6B7280',
            icon: '👤',
            text: '用户'
          },
          permissions: {
            canVerifyIssue: false,
            canCreateProject: false,
            canPublishPolicy: false,
            canProvideConsultation: false,
            canDesignSolution: false,
            canUpdateProgress: false,
            canViewUserContact: false
          },
          profile: {},
          reputation: {
            rating: 5.0,
            reviewCount: 0,
            completedTasks: 0,
            helpfulCount: 0,
            responseRate: 100,
            responseTime: 0
          }
        }
      });
    });
    
    await Promise.all(tasks);
    
    return {
      success: true,
      migratedCount: users.data.length
    };
  } catch (err) {
    console.error('迁移失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
```

在云开发控制台运行此云函数。

#### 方案 B：手动更新

在云开发控制台 → 数据库 → users 集合，手动为每个用户添加字段。

**预计时间：** 5-15 分钟（取决于用户数量）

---

### 步骤 3：测试功能

#### 3.1 测试用户注册

1. 清除小程序缓存
2. 重新进入小程序
3. 点击"登录"
4. 选择不同的用户身份
5. 填写信息并完成注册
6. 检查是否显示正确的徽章

#### 3.2 测试身份切换

1. 进入"我的"页面
2. 点击"切换身份"按钮
3. 选择新身份
4. 填写补充信息（可选）
5. 点击"确认切换"
6. 检查徽章是否更新

#### 3.3 测试权限控制

1. 切换到"设计者"身份
2. 进入任意帖子详情页
3. 检查是否显示"专业操作"区域
4. 点击"核实问题"按钮
5. 确认操作成功

#### 3.4 测试政府权限

1. 尝试切换到"政府"身份
2. 应该显示"需要认证"提示
3. 确认无法直接切换

**预计时间：** 10-15 分钟

---

## 🔍 常见问题

### Q1: 云函数上传失败
**A:** 检查网络连接，确保已登录微信开发者工具，重试上传。

### Q2: 用户看不到徽章
**A:** 
1. 检查云函数是否上传成功
2. 清除小程序缓存
3. 重新登录
4. 检查 `getUserInfo` 云函数是否返回 badge 字段

### Q3: 专业操作区不显示
**A:**
1. 检查用户类型是否正确
2. 检查 `utils/permission.js` 是否正确引入
3. 查看控制台是否有错误信息

### Q4: 核实问题失败
**A:**
1. 检查 `verifyIssue` 云函数是否上传
2. 检查用户是否有权限
3. 查看云函数日志

### Q5: 现有用户无法使用新功能
**A:**
1. 运行数据迁移脚本
2. 或让用户重新登录
3. 系统会自动补全默认值

---

## 📊 验证清单

部署完成后，请验证以下功能：

### 基础功能
- [ ] 新用户注册时可以选择身份
- [ ] 用户主页显示身份徽章
- [ ] "我的"页面显示身份徽章
- [ ] 身份切换功能正常

### 权限控制
- [ ] 普通用户看不到专业操作区
- [ ] 设计者可以看到"核实问题"和"设计方案"按钮
- [ ] 施工方可以看到"核实问题"、"提交报价"、"创建项目"按钮
- [ ] 政府身份无法直接切换

### 专业操作
- [ ] 核实问题功能正常
- [ ] 权限不足时显示友好提示
- [ ] 点击按钮后有正确的反馈

### 数据完整性
- [ ] 新用户数据结构完整
- [ ] 现有用户数据已迁移
- [ ] 用户信息显示正常

---

## 🎯 性能优化建议

### 1. 云函数优化
- 为常用云函数配置预留实例
- 设置合理的超时时间
- 启用云函数日志

### 2. 数据库优化
- 为 `userType` 字段创建索引
- 为 `verified` 字段创建索引
- 定期清理无效数据

### 3. 前端优化
- 缓存用户类型信息
- 减少不必要的权限检查
- 使用防抖处理按钮点击

---

## 📞 技术支持

如遇到问题，请检查：

1. **云函数日志**：云开发控制台 → 云函数 → 日志
2. **数据库数据**：云开发控制台 → 数据库 → users
3. **控制台错误**：微信开发者工具 → 控制台

---

## 🎉 部署完成

恭喜！三类用户体系已成功部署。

**下一步：**
- 监控用户使用情况
- 收集用户反馈
- 准备开发第三阶段功能

**文档参考：**
- `IMPLEMENTATION_SUMMARY.md` - 实施总结
- `IMPLEMENTATION_PROGRESS.md` - 进度跟踪
- `utils/userTypes.js` - 用户类型配置

---

**部署日期：** _____________

**部署人员：** _____________

**环境：** □ 开发环境  □ 测试环境  □ 生产环境

**备注：** _____________________________________________

