# 纯 Node.js 个人博客

不用 Hexo、不用 Astro、不用 React —— 一个 `server.js` 加几百行代码的个人博客。
**零依赖、无构建、存盘即发布。**

```bash
git clone https://github.com/Petersrsr/node-blog.git
cd node-blog
node server.js          # 不需要 npm install
# ▸ http://localhost:4000/
```

要求 Node 18.17+（开发时用的是 24）。`package.json` 里没有 `dependencies`。

## 特性

- **零依赖**：`node:http` 起服务器，Markdown 渲染器也是自己写的（`lib/markdown.js`）
- **零构建**：没有打包器、没有转译、没有 `dist/`，`.md` 存盘刷新即可
- **Markdown 驱动**：标题、嵌套列表、围栏代码块、表格、引用、图片、自动链接
- **安全默认值**：原始 HTML 一律转义（防 XSS）、拦 `javascript:` 链接、防路径穿越、带 CSP / nosniff 响应头
- **自带 RSS 2.0 + sitemap + robots.txt + `/healthz`**
- **草稿**：frontmatter 写 `draft: true` 即不上线（首页 / 标签 / RSS / sitemap 全部排除）

## 写文章

在 `content/posts/` 下新建 `YYYY-MM-DD-slug.md`：

```markdown
---
title: 文章标题
date: 2026-10-23
tags: [标签一, 标签二]
summary: 可选。列表页摘要，不写则自动取正文第一段。
draft: false
---

正文从这里开始。
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 缺省用文件名的 slug 段 |
| `date` | 否 | 缺省用文件名日期，再缺省用文件 mtime |
| `tags` | 否 | `[a, b]` 或逗号分隔字符串 |
| `summary` | 否 | 列表页摘要 |
| `draft` | 否 | `true` 时不发布 |

**URL**：`2026-10-23-hello-world.md` → `/posts/hello-world/`（slug 取文件名去掉日期的那一段；
两篇不同日期的文章若 slug 撞车，自动退回带日期的完整文件名，不会互相覆盖）。

### 支持的 Markdown

ATX 标题、段落、有序/无序列表（**可嵌套**）、``` 围栏代码块（带语言类名）、
行内代码、粗体、斜体、删除线、`[链接](url)`、`![图片](url)`、裸 URL 自动成链、
`>` 引用（可嵌套）、`---` 分隔线、管道表格（支持 `:---:` 对齐）。

其余原始 HTML **一律转义** —— 这是刻意的，换 XSS 免疫。

## 配置

根目录 `site.config.js`：站名、副标题、域名、首页条数、摘要字数。改完刷新即可。

域名通过环境变量注入（只影响 RSS / sitemap 里的绝对地址）：

```bash
SITE_URL=https://blog.example.com PORT=4000 node server.js
```

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 首页文章列表 |
| `/posts/<slug>/` | 文章页（含上一篇 / 下一篇） |
| `/tags/` · `/tags/<tag>/` | 全部标签 / 单个标签 |
| `/rss.xml` | RSS 2.0（最近 30 篇） |
| `/sitemap.xml` · `/robots.txt` | 站点地图 / 爬虫声明 |
| `/healthz` | 健康检查，返回 `ok` |
| `/style.css` | 样式（`public/` 下其余静态资源同理） |

## 目录结构

```
site.config.js        站点配置
server.js             HTTP 服务器 + 路由（唯一入口）
lib/markdown.js       Markdown → HTML 渲染器
lib/posts.js          扫描文章、解析 frontmatter、算 slug / 摘要 / 阅读时长
lib/template.js       HTML / RSS / sitemap 模板
public/style.css      纸墨色板样式（暖纸 + 墨 + 赭红）
content/posts/*.md    文章 —— 你唯一需要天天碰的目录
```

## 开发

```bash
npm run dev      # node --watch，改文件自动重启
npm run check    # 语法检查（不启动服务）
npm start        # 生产启动
LOG=0 node server.js   # 关掉请求日志
```

## 部署

任何能跑 Node 18+ 的地方。systemd 单元示例：

```ini
[Service]
Environment=SITE_URL=https://blog.example.com
Environment=PORT=4000
ExecStart=/usr/bin/node /opt/node-blog/server.js
Restart=on-failure
```

## 与 peter-blog 的关系

`peter-blog` 是 React 19 + Vite + Hono 那套，部署在 Cloudflare Workers。
本仓库是另一条路线：**纯 Node、无前端框架、无构建**，跑在任何有 Node 的机器上。
两者互不依赖。
