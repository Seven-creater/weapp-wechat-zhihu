# facilities 集合数据结构

## 集合名称
`facilities`

## 用途
存储社区内所有无障碍设施的信息和状态

## 字段说明

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | String | 是 | 系统自动生成 |
| _openid | String | 是 | 创建者的openid |
| facilityType | String | 是 | 设施类型：无障碍停车位、无障碍卫生间、无障碍坡道、无障碍电梯、无障碍升降台 |
| name | String | 否 | 设施名称（如：XX小区1号楼无障碍坡道） |
| location | GeoPoint | 是 | 地理位置（经纬度） |
| address | String | 是 | 地址 |
| formattedAddress | String | 否 | 格式化地址 |
| detailAddress | String | 否 | 详细地址（如：3号楼2单元） |
| status | String | 是 | 状态：accessible（可通行）、blocked（障碍点）、maintenance（维修中）、occupied（被占用） |
| statusHistory | Array | 否 | 状态历史记录 |
| images | Array | 否 | 照片URL数组 |
| description | String | 否 | 描述/备注 |
| creatorInfo | Object | 是 | 创建者信息 |
| creatorRole | String | 是 | 创建者角色：communityWorker、designer、normal |
| lastUpdateTime | Date | 是 | 最后更新时间 |
| lastUpdateBy | String | 是 | 最后更新人openid |
| verified | Boolean | 否 | 是否已验证（社区工作者验证） |
| reportCount | Number | 否 | 被举报次数 |
| viewCount | Number | 否 | 查看次数 |
| createTime | Date | 是 | 创建时间 |

## 状态说明

### accessible（可通行）
- 颜色：绿色
- 图标：✅
- 说明：设施正常，可以通行

### blocked（障碍点）
- 颜色：红色
- 图标：🚫
- 说明：存在障碍，无法通行

### maintenance（维修中）
- 颜色：黄色
- 图标：🔧
- 说明：正在维修，暂时无法使用

### occupied（被占用）
- 颜色：橙色
- 图标：⚠️
- 说明：被占用，无法正常使用

## 索引建议

1. 地理位置索引：`location`（2dsphere）
2. 状态索引：`status`
3. 设施类型索引：`facilityType`
4. 创建时间索引：`createTime`

## 示例数据

```json
{
  "_id": "facility_001",
  "_openid": "user_openid_123",
  "facilityType": "无障碍坡道",
  "name": "XX小区1号楼无障碍坡道",
  "location": {
    "type": "Point",
    "coordinates": [113.324520, 23.099994]
  },
  "address": "广东省广州市越秀区XX路XX号",
  "formattedAddress": "XX小区1号楼",
  "detailAddress": "1号楼东侧入口",
  "status": "accessible",
  "statusHistory": [
    {
      "status": "accessible",
      "updateTime": "2026-02-02T10:00:00Z",
      "updateBy": "user_openid_123",
      "updateByName": "张三",
      "updateByRole": "communityWorker",
      "images": ["cloud://xxx.jpg"],
      "notes": "设施正常"
    }
  ],
  "images": ["cloud://xxx.jpg"],
  "description": "坡度适中，有扶手，状态良好",
  "creatorInfo": {
    "nickName": "张三",
    "avatarUrl": "cloud://avatar.jpg"
  },
  "creatorRole": "communityWorker",
  "lastUpdateTime": "2026-02-02T10:00:00Z",
  "lastUpdateBy": "user_openid_123",
  "verified": true,
  "reportCount": 0,
  "viewCount": 10,
  "createTime": "2026-02-01T08:00:00Z"
}
```

## 权限说明

### 创建权限
- 社区工作者：可以创建所有类型的设施
- 设计者：可以创建所有类型的设施
- 普通用户（认证）：只能创建障碍点（blocked）

### 修改权限
- 社区工作者：可以修改所有设施
- 设计者：可以修改自己创建的设施
- 普通用户（认证）：可以修改自己创建的设施

### 删除权限
- 仅社区工作者可以删除设施

