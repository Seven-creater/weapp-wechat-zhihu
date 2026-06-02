const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join('C:', 'Users', '29785', 'Desktop', 'pictures');
const CHROME_PATH = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readSnippet(filePath, start, end) {
  const fullPath = path.join(ROOT, filePath);
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  return lines.slice(start - 1, end).join('\n');
}

function repoTree() {
  return [
    'weapp-wechat-zhihu/',
    '├─ app.js',
    '├─ app.json',
    '├─ config/',
    '│  └─ index.js',
    '├─ pages/',
    '│  ├─ community/',
    '│  ├─ issue-edit/',
    '│  ├─ post-detail/',
    '│  ├─ notify/',
    '│  ├─ chat/',
    '│  ├─ design/',
    '│  └─ project/',
    '├─ utils/',
    '│  ├─ userTypes.js',
    '│  ├─ permission.js',
    '│  └─ content.js',
    '├─ cloudfunctions/',
    '│  ├─ createIssuePost/',
    '│  ├─ getPublicData/',
    '│  ├─ createComment/',
    '│  ├─ createDesignProposal/',
    '│  ├─ createProject/',
    '│  └─ getNotificationFeed/',
    '└─ docs/'
  ].join('\n');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function baseStyles() {
  return `
    :root {
      --bg: #f6f8fb;
      --panel: #ffffff;
      --ink: #122033;
      --muted: #5e6b7a;
      --line: #d8e0ea;
      --blue: #2b6ef3;
      --blue-soft: #eaf2ff;
      --green: #1b8f5a;
      --green-soft: #eaf8f1;
      --orange: #c26b08;
      --orange-soft: #fff2e2;
      --red: #c4413a;
      --red-soft: #fdeeed;
      --shadow: 0 12px 32px rgba(18, 32, 51, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
      color: var(--ink);
    }
    .page {
      width: 1800px;
      min-height: 1080px;
      padding: 54px 64px 64px;
    }
    .eyebrow {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: #edf3ff;
      color: var(--blue);
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 42px;
      line-height: 1.18;
      font-weight: 800;
    }
    .subtitle {
      margin: 0 0 30px;
      font-size: 20px;
      line-height: 1.6;
      color: var(--muted);
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    .split {
      display: grid;
      grid-template-columns: 1.06fr 0.94fr;
      gap: 24px;
      align-items: stretch;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 16px;
      font-size: 24px;
      font-weight: 800;
    }
    .section-title::before {
      content: "";
      width: 10px;
      height: 24px;
      border-radius: 999px;
      background: var(--blue);
    }
    .panel {
      padding: 24px 28px;
    }
    pre.code {
      margin: 0;
      padding: 18px 20px;
      border-radius: 14px;
      background: #0f1723;
      color: #e9f0fb;
      font: 17px/1.55 Consolas, "Courier New", monospace;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .tree {
      margin: 0;
      padding: 18px 20px;
      border-radius: 14px;
      background: #fbfcfe;
      color: #19324c;
      font: 17px/1.55 Consolas, "Courier New", monospace;
      white-space: pre-wrap;
      border: 1px solid var(--line);
    }
    .meta {
      margin-top: 14px;
      font-size: 16px;
      color: var(--muted);
    }
    .chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .chip {
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 700;
      border: 1px solid var(--line);
      background: #fff;
    }
    .mermaid-shell {
      padding: 14px;
      background: #fff;
      border-radius: 16px;
      border: 1px solid var(--line);
      min-height: 730px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    #mermaidRoot {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #mermaidRoot svg {
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      display: block;
    }
    .note-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 18px;
    }
    .note {
      padding: 18px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fcfdff;
    }
    .note h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }
    .note p {
      margin: 0;
      font-size: 16px;
      line-height: 1.6;
      color: var(--muted);
    }
  `;
}

function buildCodeCardHtml({ title, subtitle, leftTitle, leftBody, rightTitle, rightBody, footerChips = [] }) {
  const chips = footerChips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
  return `<!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>${baseStyles()}</style>
  </head>
  <body>
    <main class="page">
      <div class="eyebrow">真实代码取样</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
      <section class="split">
        <div class="card panel">
          <h2 class="section-title">${escapeHtml(leftTitle)}</h2>
          ${leftBody}
        </div>
        <div class="card panel">
          <h2 class="section-title">${escapeHtml(rightTitle)}</h2>
          ${rightBody}
          ${chips ? `<div class="chips">${chips}</div>` : ''}
        </div>
      </section>
    </main>
  </body>
  </html>`;
}

function buildMermaidHtml({ title, subtitle, mermaid, notes = [] }) {
  const noteHtml = notes.map((item) => `
    <div class="note">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
    </div>
  `).join('');
  return `<!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>${baseStyles()}</style>
  </head>
  <body>
    <main class="page">
      <div class="eyebrow">基于真实代码关系生成</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
      <section class="card panel">
        <div id="mermaidShell" class="mermaid-shell">
          <div id="mermaidRoot"></div>
        </div>
        ${noteHtml ? `<div class="note-grid">${noteHtml}</div>` : ''}
      </section>
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'Microsoft YaHei, Arial, sans-serif',
          flowchart: { curve: 'basis' },
          er: { layoutDirection: 'LR' },
          sequence: { showSequenceNumbers: false }
        });
        const { svg } = await mermaid.render('generatedDiagram', ${JSON.stringify(mermaid)});
        document.getElementById('mermaidRoot').innerHTML = svg;
        window.__renderReady = true;
      </script>
    </main>
  </body>
  </html>`;
}

function buildImages() {
  const initCloud = readSnippet('app.js', 54, 67);
  const roleFn = readSnippet('cloudfunctions/createDesignProposal/index.js', 99, 118);
  const roleUi = readSnippet('pages/post-detail/index.js', 122, 140);

  return [
    {
      filename: '01-供需协同数字平台整体技术架构图.png',
      kind: 'mermaid',
      title: '供需协同数字平台整体技术架构图',
      subtitle: '依据项目当前代码结构绘制：小程序端通过 CloudBase 云函数读写云数据库与云存储，并在部分能力上接入内容安全、AI 和地图服务。',
      mermaid: `
flowchart LR
  subgraph MP["微信小程序端"]
    APP["app.js\\n云开发初始化 / 登录态 / 全局能力"]
    PAGES["pages/\\ncommunity / issue-edit / post-detail / notify / chat"]
    UTILS["utils/\\npermission / userTypes / content / ai"]
  end

  subgraph CB["CloudBase 云开发"]
    CF["cloudfunctions/\\ncreateIssuePost\\ngetPublicData\\ncreateComment\\ncreateDesignProposal\\ncreateProject\\ngetNotificationFeed"]
    DB[("云数据库\\nusers / posts / comments / actions\\ndesign_proposals / construction_projects")]
    STO[("云存储\\nissues/ 图片\\n方案图 / 施工图")]
  end

  EXT["外部能力\\n内容安全 / AI / 地图定位"]

  APP --> PAGES
  PAGES --> UTILS
  PAGES --> CF
  UTILS --> CF
  CF --> DB
  CF --> STO
  CF --> EXT
  DB --> PAGES
  STO --> PAGES
      `,
      notes: [
        { title: '小程序端', text: '真实目录来自 app.js、pages、utils。' },
        { title: '云函数层', text: '图中函数名称直接对应 cloudfunctions 目录。' },
        { title: '数据层', text: '集合名称依据当前 posts、comments、design_proposals 等实现。' }
      ]
    },
    {
      filename: '02-项目目录结构图与云开发初始化代码示意.png',
      kind: 'code',
      title: '项目目录结构图与云开发初始化代码示意',
      subtitle: '左侧是当前仓库的实际主目录结构，右侧是 app.js 中的真实云开发初始化代码片段。',
      leftTitle: '项目目录结构',
      leftBody: `<pre class="tree">${escapeHtml(repoTree())}</pre><div class="meta">目录结构根据当前仓库顶层与 pages/cloudfunctions 关键子目录整理。</div>`,
      rightTitle: 'app.js 中的 initCloud 代码',
      rightBody: `<pre class="code">${escapeHtml(initCloud)}</pre><div class="meta">代码来源：app.js 中的 initCloud 函数，实现 wx.cloud.init({ env, traceUser })。</div>`,
      footerChips: ['app.js', 'app.json', 'pages/', 'utils/', 'cloudfunctions/']
    },
    {
      filename: '03-角色权限校验代码与前端条件渲染逻辑图.png',
      kind: 'code',
      title: '角色权限校验的云函数代码片段与前端条件渲染逻辑图',
      subtitle: '左侧采用真实云函数权限校验片段，右侧展示 post-detail 页面依据 userType 控制按钮显示的逻辑。',
      leftTitle: '云函数权限校验片段',
      leftBody: `<pre class="code">${escapeHtml(roleFn)}</pre><div class="meta">代码来源：cloudfunctions/createDesignProposal/index.js，设计师身份校验。</div>`,
      rightTitle: '前端条件渲染逻辑',
      rightBody: `
        <div class="mermaid-shell" style="min-height: 0; padding: 0; border: 0;">
          <div id="logicRoot"></div>
        </div>
        <pre class="code" style="margin-top: 18px;">${escapeHtml(roleUi)}</pre>
        <div class="meta">代码来源：pages/post-detail/index.js，页面根据 userType 计算 isDesigner / isContractor / isCommunityWorker。</div>
        <script type="module">
          import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
          mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'Microsoft YaHei, Arial, sans-serif' });
          const graph = \`
flowchart TD
  A["读取 userType"] --> B{"角色判断"}
  B -->|"designer"| C["显示 添加设计方案"]
  B -->|"contractor"| D["显示 创建项目 / 更新施工节点"]
  B -->|"communityWorker"| E["显示 查看联系方式 / 监督入口"]
  B -->|"post owner"| F["显示 确认完工 等自有操作"]
          \`;
          const { svg } = await mermaid.render('roleDiagram', graph);
          document.getElementById('logicRoot').innerHTML = svg;
          window.__renderReady = true;
        </script>
      `,
      footerChips: ['createDesignProposal', 'post-detail', 'userType', '条件渲染']
    },
    {
      filename: '04-社区圈核心数据流图.png',
      kind: 'mermaid',
      title: '社区圈核心数据流',
      subtitle: '根据 issue-edit、createIssuePost、getPublicData、post-detail、createComment 的真实调用关系绘制。',
      mermaid: `
flowchart TD
  UI["居民在 issue-edit 填写问题\\n上传图片 / 选择社区 / 定位"]
  UP["wx.cloud.uploadFile\\n图片上传到云存储"]
  CALL["wx.cloud.callFunction('createIssuePost')"]
  WRITE["createIssuePost\\n校验字段并写入 posts"]
  POSTS[("posts 集合")]
  LIST["community.js\\n调用 getPublicData 列表查询"]
  CARD["社区圈卡片展示"]
  DETAIL["post-detail.js\\n加载详情"]
  COMMENT["createComment\\n写入 comments 并回写 stats.comment"]
  FEEDBACK["详情页互动更新"]

  UI --> UP --> CALL --> WRITE --> POSTS --> LIST --> CARD --> DETAIL --> COMMENT --> FEEDBACK
      `,
      notes: [
        { title: '发布入口', text: '来自 pages/issue-edit/index.js 的 submitIssue。' },
        { title: '列表查询', text: '来自 pages/community/community.js 调用 getPublicData。' },
        { title: '详情互动', text: '评论通过 createComment 落库并更新帖子统计。' }
      ]
    },
    {
      filename: '05-design_proposals与construction_projects集合ER关系图.png',
      kind: 'mermaid',
      title: 'design_proposals 与 construction_projects 集合的 ER 关系图',
      subtitle: '按照 createDesignProposal 与 createProject 中的实际字段关系绘制，体现帖子、用户、方案、施工项目之间的连接。',
      mermaid: `
erDiagram
  USERS ||--o{ DESIGN_PROPOSALS : "designerId / _openid"
  USERS ||--o{ CONSTRUCTION_PROJECTS : "contractorId"
  POSTS ||--o{ DESIGN_PROPOSALS : "postId / issueId"
  POSTS ||--o| CONSTRUCTION_PROJECTS : "issueId"

  USERS {
    string _openid
    string userType
    object userInfo
  }

  POSTS {
    string _id
    string type
    string status
    object stats
  }

  DESIGN_PROPOSALS {
    string _openid
    string postId
    string issueId
    string designerId
    string description
    number budgetAdjustment
    string status
  }

  CONSTRUCTION_PROJECTS {
    string issueId
    string contractorId
    string title
    string status
    string currentStage
    array stages
  }
      `,
      notes: [
        { title: '设计方案', text: 'design_proposals 由设计师提交，关联 issue 帖子。' },
        { title: '施工项目', text: 'construction_projects 由施工方创建，通常一个 issue 对应一个项目。' },
        { title: '来源', text: '字段依据 createDesignProposal/index.js 与 createProject/index.js。' }
      ]
    },
    {
      filename: '06-消息通知与watch监听时序图.png',
      kind: 'mermaid',
      title: '消息通知与 watch 监听的时序图',
      subtitle: '当前实现里，点赞/评论通知由 getNotificationFeed 聚合，实时监听主要用于 chat 页面消息流和部分详情页数据更新。',
      mermaid: `
sequenceDiagram
  participant U1 as 互动用户
  participant CF1 as createComment / 点赞云函数
  participant DB as comments / actions / posts
  participant N as getNotificationFeed
  participant Owner as 帖子作者
  participant Chat as chat.js watch
  participant Msg as messages 集合

  U1->>CF1: 评论 / 点赞 / 收藏
  CF1->>DB: 写入 comments 或 actions\\n并更新帖子统计
  Owner->>N: 打开通知页
  N->>DB: 查询自己帖子相关互动记录
  DB-->>N: 返回 comments / actions / posts
  N-->>Owner: 生成通知列表

  Owner->>Chat: 打开聊天页
  Chat->>Msg: collection('messages').watch()
  Msg-->>Chat: onChange(snapshot)
  Chat-->>Owner: 实时刷新消息列表
      `,
      notes: [
        { title: '通知页', text: '数据聚合函数是 cloudfunctions/getNotificationFeed。' },
        { title: '实时监听', text: 'watch 的明确落地点是 pages/chat/chat.js。' },
        { title: '真实现状', text: '项目里没有把所有状态同步都做成 watch，主要是消息流更实时。' }
      ]
    }
  ];
}

async function screenshotHtml(page, html, outputPath) {
  await page.setContent(html, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__renderReady === true, { timeout: 5000 });
  } catch (err) {
    // Most pages do not set a render flag; fall back to a short settle wait.
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function renderMermaidPage(page, html, outputPath) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__renderReady === true, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1080 },
    deviceScaleFactor: 2
  });
  const items = buildImages();

  for (const item of items) {
    const page = await context.newPage();
    const outPath = path.join(OUTPUT_DIR, item.filename);
    if (item.kind === 'mermaid') {
      await renderMermaidPage(page, buildMermaidHtml(item), outPath);
    } else {
      await screenshotHtml(page, buildCodeCardHtml(item), outPath);
    }
    await page.close();
    console.log(outPath);
  }

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
