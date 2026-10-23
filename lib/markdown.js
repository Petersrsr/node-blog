'use strict';

/**
 * 纯 Node 的 Markdown → HTML 渲染器，零依赖。
 *
 * 支持：Setext 以外的 ATX 标题、段落、有序/无序列表（含嵌套）、
 * 代码块（``` 围栏 + 语言类名）、行内代码、粗体/斜体/删除线、
 * 链接、图片、行内自动链接、引用、分隔线、表格、HTML 转义。
 *
 * 不支持（博客用不上，故意省掉）：Setext 标题、脚注、定义列表、
 * 原始 HTML 透传（一律转义，避免 XSS）。
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ESC[c]);
}

/** 只放行安全协议，拦掉 javascript:/data: 之类。 */
function safeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '#';
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(u)) return u;
  if (/^\.{1,2}\//.test(u)) return u;
  if (/^[\w.@+-]+(?:\/[\w.@+-]+)*$/.test(u)) return u; // 相对 slug / 资源路径
  return '#';
}

/** 行内语法。 */
function inline(raw) {
  let s = escapeHtml(String(raw));
  const stash = [];
  const keep = html => {
    stash.push(html);
    return '\u0001' + (stash.length - 1) + '\u0001';
  };
  const restore = () => {
    let prev;
    do {
      prev = s;
      s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => (stash[Number(i)] !== undefined ? stash[Number(i)] : ''));
    } while (s !== prev);
  };

  // 1) 行内代码优先保护，里面的 * ` 等不再参与语法
  s = s.replace(/`([^`\n]+)`/g, (m, c) => keep('<code>' + c + '</code>'));

  // 2) 强调
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])__([^_\n]+)__(?![_\w])/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^~\w])~~([^~\n]+)~~(?![~\w])/g, '$1<del>$2</del>');

  // 3) 图片（先于链接，避免 ! 被吞）
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    keep('<img src="' + safeUrl(src) + '" alt="' + alt + '" loading="lazy">')
  );

  // 4) 链接
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const url = safeUrl(href);
    const ext = /^https?:\/\//i.test(url);
    return keep(
      '<a href="' + url + '"' + (ext ? ' rel="noopener noreferrer"' : '') + '>' + text + '</a>'
    );
  });

  // 5) 裸 URL 自动成链（已在标签/已成链的不再重复处理，因为 3、4 已 stash）
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>"')\]]+)/g, (m, pre, url) =>
    pre + keep('<a href="' + url + '" rel="noopener noreferrer">' + url + '</a>')
  );

  restore();
  return s;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim());
}

function isBlockStart(lines, i) {
  const line = lines[i];
  if (!line || !line.trim()) return true;
  if (/^\s{0,3}(```+|~~~+)/.test(line)) return true;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return true;
  if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) return true;
  if (line.includes('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) return true;
  return false;
}

/** 从 start 行开始吃掉一个列表（含嵌套子列表与续行）。 */
function parseList(lines, start) {
  const first = lines[start];
  const ordered = /^\s*\d+[.)]\s+/.test(first);
  const baseIndent = first.length - first.trimStart().length;
  const itemRe = ordered ? /^(\s*)\d+[.)]\s+(.*)$/ : /^(\s*)[-*+]\s+(.*)$/;
  const anyItemRe = /^\s*(?:[-*+]|\d+[.)])\s+/;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      // 空行：往后看是否还有同级项，有则列表继续（支持列表中间的空行）
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        const m = lines[j].match(itemRe);
        const ind = lines[j].length - lines[j].trimStart().length;
        if (m && ind === baseIndent) {
          i = j;
          continue;
        }
      }
      break;
    }

    const ind = line.length - line.trimStart().length;
    const m = line.match(itemRe);

    if (m && ind === baseIndent) {
      items.push({ content: [m[2]], children: [] });
      i++;
      continue;
    }

    if (ind > baseIndent) {
      if (!items.length) break;
      if (anyItemRe.test(line)) {
        const sub = parseList(lines, i);
        items[items.length - 1].children.push(sub.html);
        i = sub.next;
      } else {
        items[items.length - 1].content.push(line.trim());
        i++;
      }
      continue;
    }

    break; // 缩进更浅，或同缩进但是另一种列表（换块处理）
  }

  const tag = ordered ? 'ol' : 'ul';
  const html =
    '<' + tag + '>' +
    items
      .map(it => '<li>' + inline(it.content.join(' ')) + it.children.join('') + '</li>')
      .join('') +
    '</' + tag + '>';

  return { html, next: Math.max(i, start + 1) };
}

function plainText(md, limit) {
  const t = String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/gm, ' ')
    .replace(/[*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limit || t.length <= limit) return t;
  return t.slice(0, limit).replace(/\s+\S*$/, '') + '…';
}

/** Markdown 文档 → HTML 片段。 */
function toHtml(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 代码围栏
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (fence) {
      const indent = line.length - line.trimStart().length;
      const marker = fence[1];
      const lang = fence[2];
      const buf = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break;
        buf.push(lines[i].slice(Math.min(indent, lines[i].length)));
        i++;
      }
      i++; // 跳过闭合围栏
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
      out.push('<pre><code' + cls + '>' + escapeHtml(buf.join('\n')) + '\n</code></pre>');
      continue;
    }

    // ATX 标题
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lv = h[1].length;
      out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>');
      i++;
      continue;
    }

    // 分隔线
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // 引用
    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + toHtml(buf.join('\n')) + '</blockquote>');
      continue;
    }

    // 表格（当前行含 |，下一行是分隔行）
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(c => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'ta-center' : r ? 'ta-right' : l ? 'ta-left' : '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const th = head
        .map((c, k) => '<th' + (aligns[k] ? ' class="' + aligns[k] + '"' : '') + '>' + inline(c) + '</th>')
        .join('');
      const tb = rows
        .map(
          r =>
            '<tr>' +
            head
              .map((c, k) => {
                const cls = aligns[k] ? ' class="' + aligns[k] + '"' : '';
                return '<td' + cls + '>' + inline(r[k] || '') + '</td>';
              })
              .join('') +
            '</tr>'
        )
        .join('');
      out.push(
        '<div class="table-wrap"><table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></div>'
      );
      continue;
    }

    // 列表
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const res = parseList(lines, i);
      out.push(res.html);
      i = res.next;
      continue;
    }

    // 段落：吃到空行或下一个块起始
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) {
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    } else {
      i++; // 防御：避免死循环
    }
  }

  return out.join('\n');
}

module.exports = { toHtml, inline, escapeHtml, plainText, safeUrl };
