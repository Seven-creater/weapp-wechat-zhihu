# 小程序性能优化部署清单

## 1. 只部署这些云函数

本轮优化涉及以下函数，请逐个“上传并部署（云端安装依赖）”：

1. `cloudfunctions/getUsersBatch`（新增）
2. `cloudfunctions/getNotificationSummary`（新增）
3. `cloudfunctions/getNotificationFeed`（新增）
4. `cloudfunctions/getFollowList`（已更新）
5. `cloudfunctions/getPublicData`（已更新）

## 2. 不要部署这些目录

以下目录是共享代码目录，不是独立云函数：

1. `cloudfunctions/_shared`
2. `cloudfunctions/common`

如果上传这两个目录，会出现 `ResourceNotFound.Function` 或运行时异常。

## 3. 推荐数据库索引（需手工）

在云开发控制台手工创建以下复合索引：

### conversations
1. `ownerId` + `updateTime(desc)`
2. `ownerId` + `targetId`

### actions
1. `type` + `targetId` + `createTime(desc)`
2. `_openid` + `type` + `createTime(desc)`

### comments
1. `postId` + `createTime(desc)`
2. `_openid` + `postId` + `createTime(desc)`

### follows
1. `_openid` + `createTime(desc)`
2. `targetId` + `createTime(desc)`
3. `_openid` + `targetId`

### posts
1. `_openid` + `createTime(desc)`
2. `type` + `createTime(desc)`
3. `status` + `createTime(desc)`

## 4. 发布后验收

1. 通知页汇总请求应收敛为 1 次（不再是多次 count/latest 查询）。
2. 点赞/评论通知列表应为服务端分页，不再先全量拉取再前端切片。
3. 关注/粉丝列表翻页应按页请求 `getFollowList`。
4. 反复进出 `case-detail`，评论监听不应叠加。
5. `post-detail/mine/my-favorites/my-issues/user-profile/notify` 在短时间切换应命中 TTL，后台请求明显下降。
