# 焕界营造 - 社区无障碍服务小程序

> 长沙理工大学建筑学院社区志愿服务项目  
> WeChat Mini Program for community accessibility reporting, diagnosis, governance and follow-up.

## 项目状态
- 当前阶段：功能基本完成，进入性能优化与安全加固阶段。
- 维护原则：不改页面结构与交互主流程，优先做低风险高收益优化。
- 最近更新：2026-03-15。

## 核心能力
1. 社区无障碍问题上报与案例沉淀。
2. 社区动态、评论、点赞、收藏、关注体系。
3. 施工/设计相关服务流程与进度跟踪。
4. 通知中心（点赞通知、评论通知、关注消息等）。
5. 用户身份、认证与权限管理。

## 近期性能与安全优化（2026-03）
### 已落地
1. 通知流改造为服务端分页，减少前端全量拉取再切片。
2. 用户信息批量查询能力（`getUsersBatch`）与短 TTL 缓存。
3. 关注/粉丝列表分页化（`getFollowList`）并补充资料按需返回。
4. 云端媒体 URL 解析复用，减少重复 `getTempFileURL` 请求。
5. 关键写操作补充服务端输入校验与权限判断（删除、关注、发消息、资料更新等路径）。

### 本次补充
1. `getPublicData` 分页上限收紧：`MAX_PAGE_SIZE` 从 `1000` 下调到 `100`，降低单次查询与响应体积上界。
2. `getPublicData` 排序字段白名单：仅允许 `createTime`/`updateTime`，非法值自动回退 `createTime`，降低异常排序带来的慢查询风险。

## 技术栈
- 前端：微信小程序原生框架
- 云端：微信云开发（Cloud Functions + Cloud Database + Cloud Storage）
- 地图：腾讯地图相关能力
- 代码组织：`pages/`、`utils/`、`cloudfunctions/` 模块化结构

## 目录结构（简版）
```text
weapp-wechat-zhihu/
├─ pages/                  # 小程序页面
├─ utils/                  # 前端工具模块
├─ cloudfunctions/         # 云函数
│  ├─ _shared/             # 共享鉴权/校验/埋点模块（不要单独部署）
│  └─ */index.js           # 各业务函数入口
├─ docs/                   # 优化与部署文档
├─ app.js / app.json
└─ README.md
```

## 本地开发
### 环境要求
- 微信开发者工具
- Node.js >= 14
- 已开通微信云开发环境

### 启动步骤
1. 克隆仓库并在微信开发者工具打开。
2. 配置云环境 ID（参考 `config/index.js`）。
3. 按需上传并部署云函数（见下方“部署清单”）。
4. 创建/确认数据库集合与索引。
5. 编译并在真机或模拟器验证。

## 部署清单（本轮优化相关）
仅需重点部署以下云函数：
1. `cloudfunctions/getUsersBatch`（新增）
2. `cloudfunctions/getNotificationSummary`（新增）
3. `cloudfunctions/getNotificationFeed`（新增）
4. `cloudfunctions/getFollowList`（更新）
5. `cloudfunctions/getPublicData`（更新）

不要单独部署以下目录：
1. `cloudfunctions/_shared`
2. `cloudfunctions/common`

## 推荐索引（云开发控制台手工创建）
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

## 验证清单（发布后）
1. 通知摘要接口请求收敛为单次聚合查询路径。
2. 点赞/评论通知列表走服务端分页。
3. 关注/粉丝列表翻页只拉取当前页。
4. 页面反复进入不再重复叠加监听器与无效请求。
5. 关键页面短时间切换可命中缓存，后端请求量下降。

## 安全说明
- 关键写操作必须在云函数进行权限校验，不能仅依赖前端判断。
- 所有写入入参执行类型/长度/枚举校验。
- 返回数据默认最小化，敏感字段按“最小权限”策略返回。

## 相关文档
- [性能与安全基线](./docs/performance-security-baseline.md)
- [优化部署检查清单](./docs/optimization-deploy-checklist.md)
- [云函数 API 文档](./云函数API文档.md)

## 许可
本项目用于教学研究与公益服务场景，请勿未经授权用于商业用途。
