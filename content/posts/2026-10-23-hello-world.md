---
title: 你好，这是我的新博客
date: 2026-10-23
tags: [公告, Node.js]
summary: 不用 Hexo、不用 Hono、不用 React —— 一个 node server.js 加几百行代码，博客就跑起来了。
---

这是我用纯 Node.js 写的个人博客。没有静态站点生成器，没有前端框架，没有构建步骤，**没有一个 npm 依赖**。

`package.json` 里的 `dependencies` 是空的，所以这个项目连 `npm install` 都不用执行：

```bash
git clone https://github.com/Petersrsr/node-blog.git
cd node-blog
node server.js
# ▸ http://localhost:4000/
```

## 它是怎么工作的

请求进来之后只有一条路径：

1. `node:http` 起一个服务器，`server.js` 里手写路由匹配；
2. 扫一遍 `content/posts/*.md`，正则拆 frontmatter；
3. `lib/markdown.js` 把正文渲染成 HTML（这个渲染器也是自己写的）；
4. `lib/template.js` 拼上页头页尾，返回。

没有任何缓存层，改完存盘刷新页面就是新的。文章量在几百篇以内时，每次请求重扫目录的开销可以忽略。

## 写一篇文章

在 `content/posts/` 下新建一个文件，文件名格式是 `YYYY-MM-DD-slug.md`：

```markdown
---
title: 文章标题
date: 2026-10-23
tags: [标签一, 标签二]
summary: 可选，列表页显示的摘要。不写就自动取正文第一段。
---

正文从这里开始。
```

支持的 frontmatter 字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 否 | 不写则用文件名的 slug 部分 |
| `date` | 否 | 不写则用文件名里的日期，再不济用文件修改时间 |
| `tags` | 否 | 数组或逗号分隔的字符串 |
| `summary` | 否 | 列表页摘要 |
| `draft` | 否 | `true` 时该文不发布 |

Markdown 支持的语法：

- ATX 标题 `#` ~ `######`
- 段落、有序/无序列表（**可以嵌套**）
- 代码围栏 ```  带语言名会输出 `class="language-xxx"`
- 行内代码、**粗体**、*斜体*、~~删除线~~
- `[链接](url)`、`![图片](url)`、裸 URL 自动成链
- `>` 引用、`---` 分隔线
- 管道表格，支持 `:---:` 对齐
- 其余原始 HTML **一律转义**（防 XSS，代价是不能内嵌小部件）

## 部署

任何能跑 Node 18+ 的地方都行：

```bash
PORT=4000 SITE_URL=https://blog.example.com node server.js
```

`SITE_URL` 只影响 RSS 和 sitemap 里的绝对地址，不设也能跑（会退回 `http://localhost:4000`）。健康检查探针在 `/healthz`。

用 systemd 托管的话，把 `ExecStart` 指到 `node /path/to/server.js`，再设 `Environment=SITE_URL=...` 即可。

## 配置

所有站点级设置集中在根目录的 `site.config.js`：站名、副标题、域名、每页条数、摘要字数。改完刷新即可。

## 目录结构

```
site.config.js        站点配置（站名/域名/条数）
server.js             HTTP 服务器 + 路由（唯一的入口）
lib/markdown.js       Markdown → HTML 渲染器
lib/posts.js          扫描文章、解析 frontmatter
lib/template.js       HTML / RSS / sitemap 模板
public/style.css      纸墨色板样式
content/posts/*.md    文章（唯一需要你天天碰的目录）
```

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 首页，文章列表 |
| `/posts/<slug>/` | 文章页 |
| `/tags/` | 全部标签 |
| `/tags/<tag>/` | 某个标签下的文章 |
| `/rss.xml` | RSS 2.0 |
| `/sitemap.xml` | sitemap |
| `/healthz` | 健康检查 |
