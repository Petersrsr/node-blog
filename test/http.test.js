'use strict';

/**
 * 集成测试：自起一个服务器实例（随机端口），请求各路由后自行清理。
 * 不依赖预跑的服务，也不碰机器上其它进程。
 *
 *   node test/http.test.js
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0;
const failures = [];
let child = null;

function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
    })
    .catch(err => {
      failures.push({ name, message: err && err.message });
    });
}

function req(pathname) {
  return new Promise((resolve, reject) => {
    const r = http.get(BASE + pathname, { timeout: 8000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers })
      );
    });
    r.on('error', reject);
    r.on('timeout', () => {
      r.destroy(new Error('timeout'));
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await req('/healthz');
      if (r.status === 200) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise(res => setTimeout(res, 150));
  }
  throw new Error('服务器 9 秒内未就绪');
}

async function main() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', LOG: '0', SITE_URL: 'https://blog.example.com' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childLog = '';
  child.stdout.on('data', d => (childLog += d));
  child.stderr.on('data', d => (childLog += d));

  await waitForServer();

  // ── 路由 ──────────────────────────────────────
  await t('启动日志显示文章数', async () => {
    assert(/posts: \d+ 篇/.test(childLog), `日志: ${childLog}`);
  });

  let home;
  await t('首页 200', async () => {
    home = await req('/');
    assert(home.status === 200, `HTTP ${home.status}`);
    assert(home.headers['content-type'].includes('text/html'), home.headers['content-type']);
    assert(home.headers['cache-control'].includes('no-cache'), `Cache-Control: ${home.headers['cache-control']}`);
    assert(home.headers['x-content-type-options'] === 'nosniff', '缺 nosniff');
    assert(home.headers['content-security-policy'], '缺 CSP');
  });

  const links = home ? [...new Set(home.body.match(/href="(\/posts\/[^"]+)"/g) || [])].map(s => s.slice(6, -1)) : [];
  await t('首页列出 3 篇已发布文章', async () => {
    assert(links.length === 3, `拿到 ${links.length} 条: ${links.join(', ')}`);
  });

  await t('草稿不进首页', async () => {
    assert(!home.body.includes('wip-draft'), '草稿 slug 泄露');
    assert(!home.body.includes('还没写完'), '草稿标题泄露');
  });

  for (const link of links) {
    await t(`文章页 200 ${link}`, async () => {
      const r = await req(link);
      assert(r.status === 200, `HTTP ${r.status}`);
      assert(r.body.includes('<h1>'), '无 h1');
      assert(r.body.includes('<p>'), '无段落');
      assert(!/<script/i.test(r.body), '出现 script 标签');
      assert(r.body.includes('/style.css'), '未引样式');
    });
  }

  await t('文章渲染出表格/代码/引用', async () => {
    const r = await req('/posts/synology-nfs-permissions/');
    assert(r.body.includes('<table>'), '缺表格');
    assert(r.body.includes('<blockquote>'), '缺引用');
    assert(r.body.includes('<pre>'), '缺代码块');
    assert(r.body.includes('<ul>'), '缺列表');
  });

  await t('草稿直连 404（两种 slug）', async () => {
    assert((await req('/posts/wip-draft/')).status === 404, '按 slug 可访问草稿');
    assert((await req('/posts/2026-10-25-wip-draft/')).status === 404, '按文件名可访问草稿');
  });

  await t('未知文章与页面 404', async () => {
    assert((await req('/posts/nope/')).status === 404, '不存在的文章');
    assert((await req('/nothing-here')).status === 404, '不存在的页面');
  });

  await t('路径穿越被拦', async () => {
    assert((await req('/public/../server.js')).status === 404, '越权读 server.js');
    assert((await req('/content/posts/2026-10-23-hello-world.md')).status === 404, '越权读 .md');
    assert((await req('/../site.config.js')).status !== 200, '越权读配置');
  });

  await t('标签路由', async () => {
    assert((await req('/tags/')).status === 200, '标签总览');
    const r = await req('/tags/NFS/');
    assert(r.status === 200, 'NFS 标签页');
    assert(r.body.includes('群晖 NFS'), '未列出该标签文章');
    assert(!r.body.includes('家庭实验室'), '混入了其它标签的文章');
    assert((await req('/tags/nope/')).status === 404, '不存在的标签应 404');
  });

  await t('RSS 2.0', async () => {
    const r = await req('/rss.xml');
    assert(r.status === 200, `HTTP ${r.status}`);
    assert(r.headers['content-type'].includes('rss+xml'), r.headers['content-type']);
    assert(r.body.startsWith('<?xml'), '不是 XML');
    assert((r.body.match(/<item>/g) || []).length === 3, 'item 数不对');
    assert(r.body.includes('https://blog.example.com/posts/'), '未用 SITE_URL 绝对地址');
    assert(!r.body.includes('wip-draft'), 'RSS 混入草稿');
    assert(r.body.includes('<atom:link'), '缺 self link');
  });

  await t('sitemap / robots / healthz', async () => {
    const sm = await req('/sitemap.xml');
    assert(sm.status === 200 && sm.body.includes('<urlset'), 'sitemap');
    assert(!sm.body.includes('wip-draft'), 'sitemap 混入草稿');
    const rb = await req('/robots.txt');
    assert(rb.status === 200 && rb.body.includes('Sitemap:'), 'robots');
    assert((await req('/healthz')).body.trim() === 'ok', 'healthz');
  });

  await t('静态样式与未知静态文件', async () => {
    const r = await req('/style.css');
    assert(r.status === 200 && r.headers['content-type'].includes('text/css'), 'style.css');
    assert(r.headers['cache-control'].includes('max-age'), '静态资源无缓存头');
    assert((await req('/nope.css')).status === 404, '不存在的静态文件');
  });

  await t('404 页是 HTML 且带 404 文案', async () => {
    const r = await req('/no-such-page');
    assert(r.status === 404 && r.body.includes('404'), `HTTP ${r.status}`);
  });

  await t('方法限制', async () => {
    const code = await new Promise((resolve, reject) => {
      const r = http.request(BASE + '/', { method: 'POST' }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      r.on('error', reject);
      r.end('x');
    });
    assert(code === 405, `POST 返回 ${code}`);
  });

  await t('PORT 环境变量生效', async () => {
    assert(child.exitCode === null, '子进程已退出');
  });
}

main()
  .catch(err => {
    failures.push({ name: '集成测试执行', message: err.message });
  })
  .finally(() => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      setTimeout(() => child && child.exitCode === null && child.kill('SIGKILL'), 2000).unref();
    }
    console.log(`\n${pass} passed, ${failures.length} failed   (port ${PORT})`);
    for (const f of failures) console.log(`\n  ✗ ${f.name}\n    ${f.message}`);
    process.exit(failures.length ? 1 : 0);
  });
