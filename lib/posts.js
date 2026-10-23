'use strict';

/**
 * 扫描 content/posts/*.md，解析 frontmatter，渲染成文章对象。
 * 每次请求都重新读盘 —— 文章量级很小，换来的是「存盘即生效」。
 */

const fs = require('node:fs');
const path = require('node:path');
const { toHtml, plainText } = require('./markdown');
const config = require('../site.config');

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/** 解析 YAML 风格的 frontmatter（只支持 key: value 和 key: [a, b]）。 */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };

  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else if (v.startsWith('[') && v.endsWith(']')) {
      v = v
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    data[kv[1].toLowerCase()] = v;
  }
  return { data, body: raw.slice(m[0].length) };
}

function slugFromFilename(name) {
  const base = name.replace(/\.md$/i, '');
  const m = base.match(DATE_FILE_RE);
  return m ? m[2] : base;
}

function countChars(text) {
  // 中英混排：中日韩字符按 1 计，其余按词折算
  const cjk = (text.match(/[㐀-鿿豈-﫿　-〿＀-￯]/g) || []).length;
  const words = (text.replace(/[㐀-鿿豈-﫿　-〿＀-￯]/g, ' ').match(/\S+/g) || []).length;
  return cjk + words;
}

function isTrue(v) {
  return v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
}

/** 读取全部已发布文章，按日期从新到旧。 */
function loadPosts() {
  let files;
  try {
    files = fs.readdirSync(POSTS_DIR).filter(f => /\.md$/i.test(f));
  } catch {
    return [];
  }

  const posts = [];

  for (const file of files) {
    const full = path.join(POSTS_DIR, file);
    let raw;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    const { data, body } = parseFrontmatter(raw);
    if (isTrue(data.draft)) continue; // draft: true 的文章不发布

    const fmDate = /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : null;
    const fileDate = (file.match(DATE_FILE_RE) || [])[1] || null;
    const dateStr = fmDate || fileDate || new Date(fs.statSync(full).mtime).toISOString().slice(0, 10);
    const date = new Date(dateStr + 'T00:00:00');

    const title = (data.title || '').trim() || slugFromFilename(file).replace(/[-_]+/g, ' ');
    const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : [];
    const bodyHtml = toHtml(body);
    const chars = countChars(plainText(body, 0));
    const reading = Math.max(1, Math.round(chars / 400));

    posts.push({
      slug: slugFromFilename(file),
      title,
      date,
      dateStr,
      dateHuman: `${dateStr.replace(/-/g, '.')} `,
      tags,
      summary: (data.summary || '').trim() || plainText(body, config.excerptLength),
      description: (data.description || data.summary || '').trim() || plainText(body, 160),
      html: bodyHtml,
      excerptHtml: toHtml(plainText(body, config.excerptLength)),
      chars,
      readingMinutes: reading,
      file,
      updatedAt: fs.statSync(full).mtime,
    });
  }

  posts.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));

  // slug 默认是文件名去掉日期前缀（URL 更干净：/posts/hello-world/）。
  // 撞车时退回完整文件名，避免两篇不同日期的文章抢同一个地址。
  const seen = new Set();
  for (const p of posts) {
    if (seen.has(p.slug)) {
      p.slug = p.file.replace(/\.md$/i, '');
      console.warn(`[posts] slug 重复，改用完整文件名：${p.file} → ${p.slug}`);
    }
    seen.add(p.slug);
  }

  // 相邻关系：按时间从旧到新排列，prev = 更早，next = 更晚
  const asc = posts.slice().reverse();
  asc.forEach((p, idx) => {
    p.prev = idx > 0 ? { slug: asc[idx - 1].slug, title: asc[idx - 1].title } : null;
    p.next = idx < asc.length - 1 ? { slug: asc[idx + 1].slug, title: asc[idx + 1].title } : null;
  });

  return posts;
}

function findBySlug(slug) {
  return loadPosts().find(p => p.slug === slug) || null;
}

/** [{ tag, count }]，按数量降序。 */
function allTags(posts) {
  const map = new Map();
  for (const p of posts || loadPosts()) {
    for (const t of p.tags) map.set(t, (map.get(t) || 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function postsByTag(tag) {
  return loadPosts().filter(p => p.tags.includes(tag));
}

module.exports = { loadPosts, findBySlug, allTags, postsByTag, POSTS_DIR };
