'use strict';

/** HTML 模板：布局、首页、文章页、标签页、404、RSS、sitemap。 */

const config = require('../site.config');
const { escapeHtml } = require('./markdown');

const YEAR = new Date().getFullYear();

function layout({ title, description, body, nav = '' }) {
  const full = title ? `${title} · ${config.title}` : config.title;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(full)}</title>
<meta name="description" content="${escapeHtml(description || config.description)}">
<meta name="author" content="${escapeHtml(config.author)}">
<meta name="generator" content="node-blog (zero-dependency)">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(full)}">
<meta property="og:description" content="${escapeHtml(description || config.description)}">
<meta property="og:url" content="${escapeHtml(config.url)}/">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)} RSS" href="/rss.xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="/">${escapeHtml(config.title)}</a>
    <p class="tagline">${escapeHtml(config.tagline)}</p>
    <nav class="site-nav">${nav}</nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-foot">
  <div class="wrap">
    <span>© ${YEAR} ${escapeHtml(config.author)}</span>
    <span class="dot">·</span>
    <span>纯 Node.js 编写，零依赖</span>
    <span class="dot">·</span>
    <a href="/rss.xml">RSS</a>
  </div>
</footer>
</body>
</html>
`;
}

function navHtml(active) {
  const item = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
  return item('/', '首页', 'home') + item('/tags/', '标签', 'tags') + item('/rss.xml', 'RSS', 'rss');
}

function postMeta(p) {
  return [
    `<time datetime="${p.dateStr}">${p.dateStr.replace(/-/g, '.')}</time>`,
    `<span>阅读约 ${p.readingMinutes} 分钟</span>`,
    `<span>${p.chars.toLocaleString('en-US')} 字</span>`,
  ].join('<span class="sep">/</span>');
}

function tagList(tags) {
  if (!tags.length) return '';
  return (
    '<ul class="tags">' +
    tags.map(t => `<li><a href="/tags/${encodeURIComponent(t)}/">${escapeHtml(t)}</a></li>`).join('') +
    '</ul>'
  );
}

function homePage(posts, tags) {
  const shown = posts.slice(0, config.postsPerPage);
  const rest = posts.slice(config.postsPerPage);

  const list = shown
    .map(
      p => `  <li class="post-item">
    <div class="post-item-meta">${postMeta(p)}</div>
    <h2 class="post-item-title"><a href="/posts/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a></h2>
    <p class="post-item-excerpt">${escapeHtml(p.summary)}</p>
    ${tagList(p.tags)}
  </li>`
    )
    .join('\n');

  const older = rest.length
    ? `<section class="older">
  <h3 class="section-title">更早的文章</h3>
  <ul class="older-list">
${rest
  .map(
    p =>
      `    <li><time datetime="${p.dateStr}">${p.dateStr.replace(/-/g, '.')}</time><a href="/posts/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a></li>`
  )
  .join('\n')}
  </ul>
</section>`
    : '';

  const tagCloud = tags.length
    ? `<section class="cloud">
  <h3 class="section-title">标签</h3>
  ${tagList(tags.map(t => t.tag))}
</section>`
    : '';

  const body = `
<section class="feed">
  <h1 class="section-title">最新文章<span class="count">${posts.length}</span></h1>
  <ul class="post-list">
${list}
  </ul>
</section>
${older}
${tagCloud}
`;

  return layout({ title: '', description: config.description, body, nav: navHtml('home') });
}

function postPage(p) {
  const nav = [
    p.prev ? `<a class="np prev" href="/posts/${encodeURIComponent(p.prev.slug)}/"><span>上一篇</span>${escapeHtml(p.prev.title)}</a>` : '<span class="np disabled"><span>上一篇</span>没有了</span>',
    p.next ? `<a class="np next" href="/posts/${encodeURIComponent(p.next.slug)}/"><span>下一篇</span>${escapeHtml(p.next.title)}</a>` : '<span class="np disabled"><span>下一篇</span>没有了</span>',
  ].join('');

  const body = `
<article class="post">
  <header class="post-head">
    <div class="post-item-meta">${postMeta(p)}</div>
    <h1>${escapeHtml(p.title)}</h1>
    ${tagList(p.tags)}
  </header>
  <div class="post-body">
${p.html}
  </div>
  <nav class="post-nav">${nav}</nav>
</article>
`;

  return layout({ title: p.title, description: p.description, body, nav: navHtml('home') });
}

function tagPage(tag, posts, tags) {
  const list = posts.length
    ? posts
        .map(
          p => `  <li class="post-item">
    <div class="post-item-meta">${postMeta(p)}</div>
    <h2 class="post-item-title"><a href="/posts/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a></h2>
    <p class="post-item-excerpt">${escapeHtml(p.summary)}</p>
  </li>`
        )
        .join('\n')
    : '<li class="post-item empty">这个标签下还没有文章。</li>';

  const body = `
<section class="feed">
  <h1 class="section-title">标签「${escapeHtml(tag)}」<span class="count">${posts.length}</span></h1>
  <ul class="post-list">
${list}
  </ul>
</section>
<section class="cloud">
  <h3 class="section-title">全部标签</h3>
  ${tagList(tags.map(t => t.tag))}
</section>
`;

  return layout({ title: `标签：${tag}`, description: `标签「${tag}」下的全部文章。`, body, nav: navHtml('tags') });
}

function tagsPage(tags) {
  const body = `
<section class="cloud">
  <h1 class="section-title">全部标签<span class="count">${tags.length}</span></h1>
  <ul class="tags big">
${tags
  .map(t => `    <li><a href="/tags/${encodeURIComponent(t.tag)}/">${escapeHtml(t.tag)}</a><span class="count">${t.count}</span></li>`)
  .join('\n')}
  </ul>
</section>
`;
  return layout({ title: '标签', description: '全部文章标签。', body, nav: navHtml('tags') });
}

function notFoundPage() {
  const body = `
<section class="empty-state">
  <h1>404</h1>
  <p>这个页面不存在，或者文章还没写完。</p>
  <p><a href="/">← 回首页</a></p>
</section>
`;
  return layout({ title: '404', description: '页面不存在。', body, nav: navHtml('home') });
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function feedXml(posts) {
  const items = posts
    .slice(0, 30)
    .map(p => {
      const link = `${config.url}/posts/${encodeURIComponent(p.slug)}/`;
      return `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${xmlEscape(p.summary)}</description>
${p.tags.map(t => `      <category>${xmlEscape(t)}</category>`).join('\n')}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(config.title)}</title>
    <link>${xmlEscape(config.url)}/</link>
    <description>${xmlEscape(config.description)}</description>
    <language>zh-CN</language>
    <copyright>© ${YEAR} ${xmlEscape(config.author)}</copyright>
    <atom:link href="${xmlEscape(config.url)}/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function sitemapXml(posts) {
  const urls = [
    { loc: `${config.url}/`, priority: '1.0' },
    ...posts.map(p => ({ loc: `${config.url}/posts/${encodeURIComponent(p.slug)}/`, priority: '0.7' })),
    ...[...new Set(posts.flatMap(p => p.tags))].map(t => ({
      loc: `${config.url}/tags/${encodeURIComponent(t)}/`,
      priority: '0.4',
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    u =>
      `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`;
}

module.exports = { homePage, postPage, tagPage, tagsPage, notFoundPage, feedXml, sitemapXml, layout };
