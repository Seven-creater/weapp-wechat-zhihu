const fs = require('fs');
const path = require('path');
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function styles() {
  return `
    :root {
      --bg: #f7f8fc;
      --panel: #ffffff;
      --ink: #17263c;
      --muted: #64748b;
      --line: #d9e2ec;
      --blue: #2563eb;
      --shadow: 0 18px 44px rgba(23, 38, 60, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
    }
    .page {
      width: 1800px;
      min-height: 1080px;
      padding: 56px 64px 64px;
    }
    .tag {
      display: inline-block;
      padding: 9px 16px;
      border-radius: 999px;
      background: #ebf2ff;
      color: var(--blue);
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 44px;
      line-height: 1.18;
      font-weight: 900;
    }
    .subtitle {
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 20px;
      line-height: 1.6;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
      padding: 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .section-title {
      margin: 0 0 16px;
      font-size: 24px;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title::before {
      content: "";
      width: 10px;
      height: 24px;
      border-radius: 999px;
      background: var(--blue);
    }
    pre.code {
      margin: 0;
      padding: 20px 22px;
      border-radius: 16px;
      background: #121a27;
      color: #edf3fb;
      border: 1px solid rgba(255,255,255,0.08);
      font: 17px/1.58 Consolas, "Courier New", monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .meta {
      margin-top: 12px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .table th, .table td {
      border-bottom: 1px solid var(--line);
      padding: 14px 16px;
      text-align: left;
      font-size: 16px;
      vertical-align: top;
    }
    .table th {
      background: #f8fbff;
      font-weight: 800;
    }
    .chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .chip {
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      font-size: 15px;
      font-weight: 700;
      background: #fff;
    }
    .mermaid-box {
      min-height: 760px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      background: #fff;
    }
    #mermaidRoot, #mermaidRoot2 {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    #mermaidRoot svg, #mermaidRoot2 svg {
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      display: block;
    }
  `;
}

function wrapPage({ title, subtitle, body, tag = '真实实现整理' }) {
  return `<!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>${styles()}</style>
  </head>
  <body>
    <main class="page">
      <div class="tag">${escapeHtml(tag)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
      ${body}
    </main>
  </body>
  </html>`;
}

function flowHtml() {
  const chooseLocation = readSnippet('pages/issue-edit/index.js', 123, 205);
  const submitIssue = readSnippet('pages/issue-edit/index.js', 373, 447);
  return wrapPage({
    title: '小程序采集与上传绑定流程图',
    subtitle: '基于 pages/issue-edit/index.js 与 createIssuePost 云函数的真实调用链，描述图片、位置、描述文本如何绑定并上传。',
    body: `
      <div class="grid">
        <section class="card">
          <h2 class="section-title">采集流程</h2>
          <div class="mermaid-box"><div id="mermaidRoot"></div></div>
          <div class="chips">
            <span class="chip">wx.chooseMedia</span>
            <span class="chip">wx.chooseLocation</span>
            <span class="chip">wx.getLocation</span>
            <span class="chip">wx.cloud.uploadFile</span>
            <span class="chip">createIssuePost</span>
          </div>
        </section>
        <section class="card">
          <h2 class="section-title">真实前端代码</h2>
          <pre class="code">${escapeHtml(chooseLocation + '\n\n' + submitIssue)}</pre>
          <div class="meta">代码来源：pages/issue-edit/index.js。这里既包含图片采集，也包含位置选择、图片上传和最终提交云函数。</div>
        </section>
      </div>
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'Microsoft YaHei, Arial, sans-serif' });
        const graph = \`
flowchart TD
  A["用户在 issue-edit 页面填写问题"] --> B["wx.chooseMedia\\n拍照或相册选图"]
  A --> C["wx.chooseLocation\\n手动选点"]
  C --> D["若失败则回退 wx.getLocation"]
  B --> E["uploadImages()\\nwx.cloud.uploadFile 上传图片"]
  C --> F["前端组装 postData\\nlocation + address + images + content"]
  D --> F
  E --> F
  F --> G["wx.cloud.callFunction('createIssuePost')"]
  G --> H["云函数校验并写入 posts 集合"]
        \`;
        const { svg } = await mermaid.render('flow1', graph);
        document.getElementById('mermaidRoot').innerHTML = svg;
        window.__ready = true;
      </script>
    `
  });
}

function schemaHtml() {
  const schemaSnippet = readSnippet('cloudfunctions/createIssuePost/index.js', 58, 93);
  return wrapPage({
    title: '云数据库 posts 集合真实字段结构图',
    subtitle: '根据 createIssuePost 云函数当前实际写入字段整理。该实现并非 PostgreSQL/PostGIS，而是 CloudBase 文档型数据库 + GeoPoint。',
    body: `
      <div class="grid">
        <section class="card">
          <h2 class="section-title">真实字段结构</h2>
          <table class="table">
            <thead>
              <tr><th>字段名</th><th>实际类型</th><th>说明</th></tr>
            </thead>
            <tbody>
              <tr><td>_id</td><td>系统生成</td><td>文档唯一标识</td></tr>
              <tr><td>_openid</td><td>string</td><td>提交用户标识</td></tr>
              <tr><td>type</td><td>string</td><td>当前为 issue</td></tr>
              <tr><td>status</td><td>string</td><td>初始为 pending</td></tr>
              <tr><td>title</td><td>string</td><td>问题标题</td></tr>
              <tr><td>content</td><td>string</td><td>问题描述</td></tr>
              <tr><td>images</td><td>string[]</td><td>云存储 fileID 列表</td></tr>
              <tr><td>category / categoryId / categoryName</td><td>string</td><td>问题类别</td></tr>
              <tr><td>community</td><td>string</td><td>所属社区</td></tr>
              <tr><td>location</td><td>GeoPoint</td><td>经纬度空间坐标</td></tr>
              <tr><td>address / formattedAddress / detailAddress</td><td>string</td><td>地址信息</td></tr>
              <tr><td>userSuggestion / aiSolution</td><td>string</td><td>建议与 AI 分析结果</td></tr>
              <tr><td>stats</td><td>object</td><td>点赞、评论、收藏、浏览统计</td></tr>
              <tr><td>createTime / updateTime</td><td>serverDate</td><td>时间戳</td></tr>
            </tbody>
          </table>
        </section>
        <section class="card">
          <h2 class="section-title">真实落库代码</h2>
          <pre class="code">${escapeHtml(schemaSnippet)}</pre>
          <div class="meta">代码来源：cloudfunctions/createIssuePost/index.js。你现在的真实字段名是 content、categoryName、images、location，不是 defectDesc、facilityType、imageUrl、riskLevel。</div>
        </section>
      </div>
    `
  });
}

function markerHtml() {
  const mapSnippet = readSnippet('pages/index/index.js', 264, 404);
  return wrapPage({
    title: '社区点位分布渲染逻辑图',
    subtitle: '这张图展示代码如何把多个帖子变成地图 markers。它是真实逻辑图，不是假装成真实业务数据截图。',
    body: `
      <div class="grid">
        <section class="card">
          <h2 class="section-title">地图点位渲染流程</h2>
          <div class="mermaid-box"><div id="mermaidRoot2"></div></div>
          <div class="chips">
            <span class="chip">getPublicData</span>
            <span class="chip">geoNear</span>
            <span class="chip">extractPostLocation</span>
            <span class="chip">buildDisplayMarkers</span>
            <span class="chip">markers</span>
          </div>
        </section>
        <section class="card">
          <h2 class="section-title">真实地图页代码</h2>
          <pre class="code">${escapeHtml(mapSnippet)}</pre>
          <div class="meta">代码来源：pages/index/index.js。地图页先取附近 issue 帖子，再提取 location，最后生成 markers 交给小程序 map 组件渲染。</div>
        </section>
      </div>
      <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'Microsoft YaHei, Arial, sans-serif' });
        const graph = \`
flowchart TD
  A["index 页面获取当前位置"] --> B["fetchIssuePostsNear()"]
  B --> C["调用 getPublicData\\ncollection=posts&type=issue&near=..."]
  C --> D["云函数 geoNear 检索附近帖子"]
  D --> E["normalizeIssuePost()"]
  E --> F["extractPostLocation()\\n从 GeoPoint 提取经纬度"]
  F --> G["buildDisplayMarkers()"]
  G --> H["markers 数组写入 map 组件"]
  H --> I["用户点击 marker\\nhandleMarkerTap -> post-detail"]
        \`;
        const { svg } = await mermaid.render('flow2', graph);
        document.getElementById('mermaidRoot2').innerHTML = svg;
        window.__ready = true;
      </script>
    `
  });
}

async function screenshot(page, html, outputPath) {
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  } catch (err) {
    // not every page needs a render flag
  }
  await page.waitForTimeout(700);
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

  const page = await context.newPage();
  await screenshot(page, flowHtml(), path.join(OUTPUT_DIR, '07-小程序采集与云端绑定流程图.png'));
  await screenshot(page, schemaHtml(), path.join(OUTPUT_DIR, '08-云数据库posts集合真实字段结构图.png'));
  await screenshot(page, markerHtml(), path.join(OUTPUT_DIR, '09-社区点位渲染逻辑图.png'));
  await page.close();

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
