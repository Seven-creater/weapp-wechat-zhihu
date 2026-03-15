# 无界营造

一个面向社区无障碍治理的小程序：把“问题发现 -> 讨论协同 -> 方案落地 -> 施工跟踪”串成闭环，帮助居民、社区工作者与服务方更高效协作。

## 1. 这是个什么项目
- 项目定位：社区无障碍服务与治理平台（微信小程序）。
- 目标用户：普通居民、社区工作人员、设计/施工服务方、管理员。
- 核心目标：降低无障碍问题上报与解决成本，提高问题处理透明度和协同效率。

## 2. 能做什么（功能总览）
1. 问题与内容发布
- 发布社区相关内容、问题、经验案例。
- 支持图文内容、互动讨论、沉淀案例。

2. 社区互动
- 点赞、评论、收藏、关注。
- 用户主页可查看动态、关注关系、互动数据。

3. 通知中心
- 点赞通知、评论通知、关注消息。
- 列表分页拉取，支持下拉刷新与触底加载。

4. 身份与资料
- 用户资料编辑、身份切换、认证申请。
- 后台可进行审核与角色权限控制。

5. 施工/服务相关能力
- 项目进度跟踪、节点更新。
- 为社区改造相关场景提供过程记录能力。

## 3. 典型使用流程（业务视角）
1. 居民：发布问题/帖子 -> 社区讨论 -> 关注处理进展。
2. 服务方：查看需求 -> 参与讨论/给出方案 -> 跟踪进度。
3. 管理员：审核认证 -> 管理内容与权限 -> 保障平台秩序。

## 4. 技术架构
- 前端：微信小程序原生框架。
- 后端：微信云开发（Cloud Functions + Cloud Database + Cloud Storage）。
- 数据访问：前端通过云函数统一访问数据库。
- 媒体处理：云端文件统一转换临时访问 URL，减少前端重复处理。

## 5. 目录结构（核心）
```text
weapp-wechat-zhihu/
├─ pages/                  # 页面
├─ utils/                  # 前端工具
├─ cloudfunctions/         # 云函数
│  ├─ _shared/             # 共享鉴权/校验/埋点（不要单独部署）
│  ├─ getPublicData/
│  ├─ getNotificationFeed/
│  ├─ getNotificationSummary/
│  ├─ getUsersBatch/
│  └─ ...
├─ docs/                   # 项目文档
├─ app.js
├─ app.json
└─ README.md
```

## 6. 本地开发与运行
### 6.1 环境要求
- 微信开发者工具
- Node.js >= 14
- 已开通微信云开发并具备对应环境权限

### 6.2 启动步骤
1. 克隆仓库并在微信开发者工具打开项目。
2. 配置云环境（见 `config/index.js`）。
3. 上传并部署本次需要的云函数。
4. 在云开发控制台创建集合与索引。
5. 编译运行并在真机验证。

## 7. 云函数部署建议（重点）
优先部署/更新：
1. `cloudfunctions/getUsersBatch`
2. `cloudfunctions/getNotificationSummary`
3. `cloudfunctions/getNotificationFeed`
4. `cloudfunctions/getFollowList`
5. `cloudfunctions/getPublicData`

不要单独部署：
1. `cloudfunctions/_shared`
2. `cloudfunctions/common`

## 8. 数据与索引建议
为高频路径创建复合索引（云开发控制台手工创建）：

### conversations
1. `ownerId + updateTime(desc)`
2. `ownerId + targetId`

### actions
1. `type + targetId + createTime(desc)`
2. `_openid + type + createTime(desc)`

### comments
1. `postId + createTime(desc)`
2. `_openid + postId + createTime(desc)`

### follows
1. `_openid + createTime(desc)`
2. `targetId + createTime(desc)`
3. `_openid + targetId`

### posts
1. `_openid + createTime(desc)`
2. `type + createTime(desc)`
3. `status + createTime(desc)`

## 9. 性能与安全现状（维护重点）
### 9.1 性能方向
- 减少同页面生命周期内重复请求。
- 批量查询替代 N+1。
- 列表查询字段投影与分页收敛。
- `setData` 精简、缓存稳定资料数据。

### 9.2 安全方向
- 写操作统一在云函数做权限校验。
- 入参做类型、长度、枚举校验。
- 敏感字段最小化返回。
- 关键失败日志保留必要审计信息，不泄露敏感数据。

### 9.3 最近关键优化
1. 通知流服务端分页与摘要聚合。
2. 用户批量资料读取与短 TTL 缓存。
3. `getPublicData` 分页上限收紧，排序字段白名单化。

## 10. 发布后验证清单
1. 通知页请求数下降，触底分页行为正常。
2. 关注/粉丝列表按页加载，不全量拉取。
3. 高频页面短时切换命中缓存。
4. 写操作越权请求被服务端拒绝。
5. 关键页面 UI 与交互流程保持不变。

## 11. 常见问题
1. 云能力未初始化
- 现象：提示 `please call wx.cloud.init first`。
- 处理：确认 `app.js` 已初始化云环境，页面使用前云能力可用。

2. 云函数调用失败
- 现象：`callFunction` 返回错误。
- 处理：检查函数是否已部署、环境 ID 是否一致、依赖是否安装完整。

3. 图片无法显示
- 现象：云存储图片偶发不可访问。
- 处理：确认云文件权限与临时 URL 转换逻辑正常。

## 12. 相关文档
- [性能与安全基线](./docs/performance-security-baseline.md)
- [优化部署检查清单](./docs/optimization-deploy-checklist.md)
- [云函数 API 文档](./云函数API文档.md)

## 13. 许可说明
本项目主要用于教学研究与公益服务场景，商业化使用请先取得授权。

---
最后更新：2026-03-15
