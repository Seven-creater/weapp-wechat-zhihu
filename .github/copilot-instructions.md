## 快速概览

- **项目类型**：微信小程序（WeChat Mini Program）。入口文件：[app.js](app.js)、配置：[app.json](app.json)。
- **页面目录**：所有页面放在 `pages/` 下，每个页面通常包含 `.js`、`.wxml`、`.wxss`、可选的 `.json`（例如 [pages/index/index.js](pages/index/index.js)）。
- **云函数**：后端逻辑位于 `cloudfunctions/`（示例： [cloudfunctions/analyzeIssue/index.js](cloudfunctions/analyzeIssue/index.js)），使用 `wx-server-sdk` 与云数据库交互。
- **本地假数据**：项目使用 `data/` 下的静态模块作为伪造数据（例如 [data/data_index.js](data/data_index.js)），页面多数通过 `utils/util.js` 调用这些模块而非真实网络接口。

## 架构与关键数据流（对 AI 代理重要）

- 启动流程：`app.js` 初始化云环境 `wx.cloud.init` 并恢复 `globalData`（`userInfo`、`openid`）。修改登录/初始化逻辑时请优先审查 `app.js`。
- 页面 -> 工具 -> 数据：页面通常通过 `require('../utils/util.js')` 或直接引入 `data/*.js` 获取显示数据。若改动数据结构，要同时修改 `data/` 与依赖页面。
- 云函数交互：图片分析等功能通过上传到云存储再由云函数处理（参见 `cloudfunctions/analyzeIssue/index.js`）。云函数中存在调用外部 AI API 的占位（GPT / Claude），若要集成真实 API，应在云函数中安全读取运行时环境变量（不要把密钥写入仓库）。

## 项目惯例与约定（请遵守）

- UI 文件不做后端变更：任何改动涉及 `.wxml` / `.wxss` 要小心，优先在小程序开发者工具中验证视觉效果。
- 模块导出：使用 `module.exports` / `require` 风格（CommonJS），请不要改为 ESM。
- 本地 ID 与登录：项目使用 `wx.setStorageSync('openid', ...)` 存储简化的本地 openid；不要移除或强制改为真实云端 openid，除非同步修改所有使用点（`app.js`、云数据库查询）。
- 调试与环境：`app.json` 中 `debug: true` 可影响日志显示；云函数使用 `cloud.DYNAMIC_CURRENT_ENV`。修改环境 ID 时请查阅 `app.js` 的 `wx.cloud.init` 配置。

## 典型改动示例（AI 代理应如何修改）

- 添加后端 AI 调用：在 `cloudfunctions/analyzeIssue/index.js` 中实现 `callGPT4oVision` 或 `callClaude35Vision`，并从环境变量读取 API KEY（`process.env.OPENAI_API_KEY` 或 `process.env.ANTHROPIC_API_KEY`）。
- 修改数据展示：更新 `data/*.js` 中的结构，再在 `pages/*/*.js` 中同步解析字段（示例：`data/data_index.js` 与 `pages/index/index.js`）。
- 新页面模板：复制 `pages/solution-detail` 目录为新页面，保持 `.js`、`.wxml`、`.wxss`、`.json` 四件套的约定。

## 安全与提交注意

- 切勿将任何 API Key 或私密配置提交到仓库。对于云函数密钥，使用云环境变量或在 CI/CD secrets 中配置。
- 如果修改云函数，建议在本地先运行 `npm install`（如果存在 `package.json`），并在云端部署前在微信云控制台或 CLI 中验证。

## 开发/运行流程（项目特有）

- 无需 `npm run build`：使用微信开发者工具导入根目录即可预览与调试。README 中也说明了这一点。
- 云函数发布：编辑 `cloudfunctions/*` 后，在微信云开发控制台或使用云函数部署命令上传。

## 变更建议给 AI 代理的行为准则

- 优先 README 与 `app.js`、`app.json`、`cloudfunctions/*`、`utils/util.js`、`data/*` 中可见约定进行修改。
- 在改动 UI 或数据契约前，生成兼容性检查清单（哪些页面依赖哪些字段），并在 PR 描述中列出受影响页面。
- 不要擅自引入新的运行时依赖或打断 CommonJS 模块风格；如确实需要，先征求人工评审。

---

如果这份指导有遗漏或需要更详细的示例（例如指定页面的字段契约或某些云函数的测试步骤），请告诉我想补充的具体部分，我会迭代更新。
