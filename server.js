'use strict';

/**
 * 纯 Node.js 个人博客服务器 —— node:http 单文件路由，零依赖，无构建。
 *
 *   node server.js              # 启动（默认 0.0.0.0:4000）
 *   PORT=8080 node server.js    # 换端口
 *   SITE_URL=https://a.com node server.js   # 绝对地址（RSS/sitemap 用）
 *   node --watch server.js      # 改文件自动重启（开发）
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./site.config');
const { loadPosts, findBySlug, allTags, postsByTag } = require('./lib/posts');
const tpl = require('./lib/template');

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const STATIC_EXT = new Set(['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.txt', '.json']);

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Length': buf.length,
    ...headers,
  });
  res.end(buf);
}

function html(res, status, markup, cache = 'no-cache') {
  send(res, status, markup, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache });
}

function serveStatic(res, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const abs = path.resolve(PUBLIC_DIR, rel);
  // 路径穿越防护：解析后的路径必须仍在 public/ 内
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) {
    return false;
  }
  const ext = path.extname(abs).toLowerCase();
  if (!STATIC_EXT.has(ext)) return false;

  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  send(res, 200, fs.readFileSync(abs), {
    'Content-Type': typeFor(ext),
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
  });
  return true;
}

function typeFor(ext) {
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    }[ext] || 'application/octet-stream'
  );
}

function handle(req, res) {
  const started = process.hrtime.bigint();
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  } catch {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
  }

  const routes = () => {
    // —— 静态资源 ——
    if (pathname.startsWith('/public/')) {
      if (serveStatic(res, pathname.slice('/public'.length))) return;
      return notFound(res);
    }
    if (pathname === '/style.css' || STATIC_EXT.has(path.extname(pathname).toLowerCase())) {
      if (serveStatic(res, pathname)) return;
      if (pathname === '/style.css') return notFound(res);
    }

    // —— 站点路由 ——
    if (pathname === '/' || pathname === '/index.html') {
      const posts = loadPosts();
      return html(res, 200, tpl.homePage(posts, allTags(posts)));
    }

    if (pathname === '/rss.xml' || pathname === '/feed.xml') {
      return send(res, 200, tpl.feedXml(loadPosts()), {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
    }

    if (pathname === '/sitemap.xml') {
      return send(res, 200, tpl.sitemapXml(loadPosts()), {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
    }

    if (pathname === '/robots.txt') {
      return send(res, 200, `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      });
    }

    if (pathname === '/healthz') {
      return send(res, 200, 'ok\n', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    let m = pathname.match(/^\/posts\/([^/]+)\/?$/);
    if (m) {
      const post = findBySlug(m[1]);
      if (!post) return notFound(res);
      return html(res, 200, tpl.postPage(post));
    }

    m = pathname.match(/^\/tags\/?$/);
    if (m) return html(res, 200, tpl.tagsPage(allTags()));

    m = pathname.match(/^\/tags\/([^/]+)\/?$/);
    if (m) {
      const tag = m[1];
      const tags = allTags();
      if (!tags.some(t => t.tag === tag)) return notFound(res);
      return html(res, 200, tpl.tagPage(tag, postsByTag(tag), tags));
    }

    return notFound(res);
  };

  try {
    routes();
  } catch (err) {
    console.error(`[error] ${req.method} ${pathname}`, err);
    if (!res.headersSent) {
      send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
    } else {
      res.end();
    }
  }

  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (process.env.LOG !== '0') {
    const status = res.statusCode;
    const mark = status >= 400 ? '!' : ' ';
    console.log(`${mark}${status} ${req.method} ${pathname} ${ms.toFixed(1)}ms`);
  }
}

function notFound(res) {
  html(res, 404, tpl.notFoundPage());
}

const server = http.createServer(handle);
server.listen(PORT, HOST, () => {
  console.log(`${config.title}`);
  console.log(`  ▸ http://localhost:${PORT}/`);
  console.log(`  ▸ posts: ${loadPosts().length} 篇 · node ${process.version} · 零依赖`);
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。换一个：PORT=4001 node server.js`);
    process.exit(1);
  }
  throw err;
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
