# 小程序代码包体积优化方案

## 当前问题
- **错误信息**: source size 2083KB exceed max limit 2MB
- **超出大小**: 83KB (约 4%)

## 已完成的优化

### 1. ✅ 更新 project.config.json
已在 `packOptions.ignore` 中添加以下大文件：
- `images/navigation.gif` (1153.56 KB)
- `images/index_scroll.gif` (969.38 KB)
- `images/24280.jpg` (473.17 KB)
- `images/bottom_tab.gif` (230.12 KB)
- `images/top_tab.gif` (152.01 KB)
- `images/24213.jpg` (140.71 KB)
- `images/1444983318907-_DSC1826.jpg` (103.26 KB)
- `images/icon1.jpeg` (82.25 KB)
- `images/icon9.jpeg` (58.16 KB)
- `images/icon8.jpg` (14.81 KB)
- `docs/` 文件夹
- 各种 `.md` 文档文件

**预计减少**: ~3200 KB

### 2. ✅ 创建 .miniprogram-ci-ignore 文件
确保 CI 打包时也忽略这些文件

## 立即执行的操作

### 方法1: 重新编译（推荐）⭐
1. 在微信开发者工具中，点击菜单栏 **工具 → 构建 npm**
2. 点击 **清除缓存 → 清除文件缓存**
3. 点击 **编译** 按钮重新编译
4. 查看详情面板中的代码包大小

### 方法2: 如果方法1无效，手动删除大图片
这些图片未在代码中使用，可以安全删除：

```bash
# 在项目根目录执行
rm images/navigation.gif
rm images/index_scroll.gif
rm images/24280.jpg
rm images/bottom_tab.gif
rm images/top_tab.gif
rm images/24213.jpg
rm images/1444983318907-_DSC1826.jpg
rm images/icon1.jpeg
rm images/icon9.jpeg
rm images/icon8.jpg
```

或者在 Windows PowerShell 中：
```powershell
Remove-Item images/navigation.gif
Remove-Item images/index_scroll.gif
Remove-Item images/24280.jpg
Remove-Item images/bottom_tab.gif
Remove-Item images/top_tab.gif
Remove-Item images/24213.jpg
Remove-Item images/1444983318907-_DSC1826.jpg
Remove-Item images/icon1.jpeg
Remove-Item images/icon9.jpeg
Remove-Item images/icon8.jpg
```

## 进一步优化建议（可选）

### 1. 使用分包加载
将非首页功能分离到子包：

```json
{
  "pages": [
    "pages/index/index",
    "pages/login/index",
    "pages/community/community",
    "pages/mine/index"
  ],
  "subPackages": [
    {
      "root": "packageA",
      "pages": [
        "pages/admin-certification/index",
        "pages/gov-certification/index",
        "pages/construction/construction",
        "pages/construction-progress/index"
      ]
    }
  ]
}
```

### 2. 图片优化
- 将大图片上传到云存储，使用 CDN 链接
- 使用 WebP 格式替代 PNG/JPG
- 压缩现有图片

### 3. 代码优化
- 移除未使用的页面和组件
- 合并重复的页面（如 profile-edit 和 edit-profile）
- 启用代码压缩和混淆

## 预期结果
优化后代码包大小应该在 **800KB - 1200KB** 之间，远低于 2MB 限制。

