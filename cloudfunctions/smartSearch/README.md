# 智能搜索功能实现指南

## 一、云函数配置

### 1. 安装依赖
在微信开发者工具中，右键点击 `cloudfunctions/smartSearch` 文件夹，选择 **"在终端打开"**，然后执行：
```bash
npm install
```

### 2. 填写API Key
在云函数环境变量中配置你的 DeepSeek API Key（推荐），避免将密钥写入代码仓库。

在 `cloudfunctions/smartSearch/index.js` 中会从环境变量读取：
```javascript
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
```

如果未配置 `DEEPSEEK_API_KEY`，云函数会降级为使用用户原始关键词进行搜索（不调用 DeepSeek）。

### 3. 部署云函数
右键点击 `cloudfunctions/smartSearch` 文件夹，选择 **"上传并部署：云端安装依赖"**

## 二、前端调用示例

### 1. 方案库搜索 (`pages/solutions/index.js`)

```javascript
// 智能搜索函数
onSearch: function() {
  const keyword = this.data.searchVal.trim();
  if (!keyword) {
    wx.showToast({
      title: '请输入搜索关键词',
      icon: 'none'
    });
    return;
  }

  wx.showLoading({
    title: 'AI 正在深度搜索...',
    mask: true
  });

  wx.cloud.callFunction({
    name: 'smartSearch',
    data: {
      keyword: keyword,
      collection: 'solutions'
    },
    success: (res) => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const result = res.result;
        console.log('智能搜索结果:', result);
        
        this.setData({
          solutions: result.data,
          searchHistory: [...new Set([keyword, ...this.data.searchHistory])].slice(0, 10) // 更新搜索历史
        });
        
        // 保存搜索历史到本地
        wx.setStorageSync('solutionSearchHistory', this.data.searchHistory);
      } else {
        wx.showToast({
          title: res.result?.error || '搜索失败',
          icon: 'none'
        });
      }
    },
    fail: (err) => {
      wx.hideLoading();
      console.error('智能搜索失败:', err);
      wx.showToast({
        title: '搜索失败，请重试',
        icon: 'none'
      });
    }
  });
}
```

### 2. 社区帖子搜索 (`pages/community/index.js`)

```javascript
// 智能搜索函数
onSearch: function() {
  const keyword = this.data.searchVal.trim();
  if (!keyword) {
    wx.showToast({
      title: '请输入搜索关键词',
      icon: 'none'
    });
    return;
  }

  wx.showLoading({
    title: 'AI 正在深度搜索...',
    mask: true
  });

  wx.cloud.callFunction({
    name: 'smartSearch',
    data: {
      keyword: keyword,
      collection: 'posts'
    },
    success: (res) => {
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        const result = res.result;
        console.log('智能搜索结果:', result);
        
        this.setData({
          posts: result.data,
          searchHistory: [...new Set([keyword, ...this.data.searchHistory])].slice(0, 10) // 更新搜索历史
        });
        
        // 保存搜索历史到本地
        wx.setStorageSync('communitySearchHistory', this.data.searchHistory);
      } else {
        wx.showToast({
          title: res.result?.error || '搜索失败',
          icon: 'none'
        });
      }
    },
    fail: (err) => {
      wx.hideLoading();
      console.error('智能搜索失败:', err);
      wx.showToast({
        title: '搜索失败，请重试',
        icon: 'none'
      });
    }
  });
}
```

## 三、工作流程

```
用户输入搜索词 → 前端调用云函数 → 云函数调用DeepSeek API → 提取核心关键词 → 构造数据库查询 → 返回结果 → 前端渲染
```

## 四、示例搜索

| 用户输入 | AI 提取关键词 | 搜索效果 |
|---------|--------------|----------|
| 老人上楼困难 | 老人,上楼,困难,电梯,楼梯 | 匹配包含这些关键词的解决方案和帖子 |
| 轮椅怎么进地铁 | 轮椅,地铁,通道,入口,无障碍 | 匹配相关的无障碍解决方案 |
| 盲道被占用 | 盲道,占用,障碍,通道,修复 | 匹配相关的路障反馈和解决方案 |

## 五、注意事项

1. **API费用**：DeepSeek API按调用次数收费，请关注API使用量
2. **搜索性能**：建议在云函数中添加缓存机制，减少重复API调用
3. **错误处理**：已添加完整的错误处理逻辑，确保搜索失败时用户体验良好
4. **搜索历史**：示例代码中包含搜索历史功能，可以根据需要调整
5. **返回数量**：当前限制返回100条记录，可以根据实际需求调整

## 六、扩展建议

1. 添加搜索结果排序功能
2. 实现搜索结果分页
3. 添加搜索结果高亮显示
4. 支持筛选条件（如时间、类型等）
5. 添加热门搜索词推荐
