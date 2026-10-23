'use strict';

/**
 * Markdown 渲染器单测 —— node test/markdown.test.js（或 npm test）
 * 零依赖：用 node:assert，不装测试框架。
 */

const assert = require('node:assert');
const { toHtml, plainText, safeUrl, inline } = require('../lib/markdown');

let pass = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (err) {
    failures.push({ name, message: err.message });
  }
}

function contains(md, want, label) {
  const got = toHtml(md);
  assert.ok(
    got.includes(want),
    `${label || JSON.stringify(md)}\n  期望包含: ${want}\n  实际输出: ${got.replace(/\n/g, '\\n')}`
  );
}

// ── 块级 ──────────────────────────────────────────
t('ATX 标题', () => {
  contains('# 标题一', '<h1>标题一</h1>');
  contains('### 三级', '<h3>三级</h3>');
  contains('###### 六级', '<h6>六级</h6>');
  contains('#没有空格', '<p>#没有空格</p>');
});

t('段落与软换行', () => {
  contains('第一行\n第二行', '<p>第一行 第二行</p>');
  contains('单独一句', '<p>单独一句</p>');
});

t('分隔线', () => {
  contains('---', '<hr>');
  contains('***', '<hr>');
  contains('* * *', '<hr>');
});

t('无序列表', () => {
  contains('- a\n- b\n- c', '<ul><li>a</li><li>b</li><li>c</li></ul>');
  contains('* a\n* b', '<ul><li>a</li><li>b</li></ul>');
});

t('有序列表', () => {
  contains('1. one\n2. two', '<ol><li>one</li><li>two</li></ol>');
  contains('1) one\n2) two', '<ol><li>one</li><li>two</li></ol>');
});

t('嵌套列表', () => {
  contains(
    '- a\n  - b\n  - c\n- d',
    '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>'
  );
});

t('列表项内的强调与链接', () => {
  contains('- **粗** 项', '<li><strong>粗</strong> 项</li>');
  contains('- [链接](https://a.com)', '<li><a href="https://a.com" rel="noopener noreferrer">链接</a></li>');
});

t('列表项续行', () => {
  contains('- 第一行\n  续行内容', '<li>第一行 续行内容</li>');
});

t('列表后接段落', () => {
  const html = toHtml('- a\n- b\n\n后面的段落');
  assert.ok(html.includes('<ul><li>a</li><li>b</li></ul>'), html);
  assert.ok(html.includes('<p>后面的段落</p>'), html);
});

t('两种列表相邻不合并', () => {
  const html = toHtml('- a\n- b\n\n1. x\n2. y');
  assert.ok(html.includes('</ul>') && html.includes('<ol>'), html);
});

t('围栏代码块', () => {
  contains('```\ncode\n```', '<pre><code>code');
  contains('```js\nconst a = 1;\n```', 'class="language-js"');
  assert.ok(toHtml('```\n<>/&\n```').includes('&lt;&gt;/&amp;'), '代码内容必须转义');
});

t('带缩进的围栏', () => {
  contains('  ```\n  code\n  ```', '<pre><code>code');
});

t('未闭合围栏不死循环', () => {
  const t0 = Date.now();
  toHtml('```\n没有闭合\n还在继续');
  assert.ok(Date.now() - t0 < 1000, '渲染耗时过长，疑似死循环');
});

t('引用（可嵌套）', () => {
  contains('> 一句话', '<blockquote><p>一句话</p></blockquote>');
  contains('> a\n> b', '<blockquote><p>a b</p></blockquote>');
  contains('> a\n>\n> > b', '<blockquote>');
});

t('表格', () => {
  const html = toHtml('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.ok(html.includes('<table>'), html);
  assert.ok(html.includes('<th>a</th>') && html.includes('<td>1</td>'), html);
});

t('表格对齐', () => {
  const html = toHtml('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |');
  assert.ok(html.includes('class="ta-left"'), html);
  assert.ok(html.includes('class="ta-center"'), html);
  assert.ok(html.includes('class="ta-right"'), html);
});

t('表格单元格数不足不崩', () => {
  const html = toHtml('| a | b | c |\n|---|---|---|\n| 1 |');
  assert.ok(html.includes('<table>'), html);
});

// ── 行内 ──────────────────────────────────────────
t('粗体/斜体/删除线/行内代码', () => {
  contains('**粗** *斜* ~~删~~ `码`', '<strong>粗</strong> <em>斜</em> <del>删</del> <code>码</code>');
  contains('__粗__', '<strong>粗</strong>');
  contains('***粗斜***', '<strong><em>粗斜</em></strong>');
});

t('行内代码不参与其他语法', () => {
  contains('`a *b* c`', '<code>a *b* c</code>');
  contains('`**x**`', '<code>**x**</code>');
});

t('链接', () => {
  contains('[文字](https://a.com)', '<a href="https://a.com" rel="noopener noreferrer">文字</a>');
  contains('[站内](/posts/x/)', '<a href="/posts/x/">站内</a>');
  contains('[锚点](#top)', '<a href="#top">锚点</a>');
});

t('图片', () => {
  contains('![图](/a.png)', '<img src="/a.png" alt="图" loading="lazy">');
  contains('![图](https://a.com/b.png)', '<img src="https://a.com/b.png"');
});

t('裸 URL 自动成链', () => {
  contains('看 https://example.com/x 这里', 'href="https://example.com/x"');
  assert.ok(toHtml('https://example.com').includes('<a href="https://example.com"'), '整段 URL 也成链');
});

t('危险协议被拦', () => {
  contains('[x](javascript:alert(1))', '<a href="#">x</a>');
  contains('[x](data:text/html,<script>)', '<a href="#">x</a>');
  assert.ok(!toHtml('[x](JaVaScRiPt:alert(1))').includes('javascript'), '大小写绕过也拦');
  assert.ok(safeUrl('vbscript:x') === '#', 'vbscript');
});

t('原始 HTML 一律转义', () => {
  contains('<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;');
  contains('<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!toHtml('<svg onload=x>').includes('<svg'), 'svg 也转义');
});

t('特殊字符转义', () => {
  contains('a & b', 'a &amp; b');
  contains('"引号" 和 \'单引号\'', '&quot;引号&quot; 和 &#39;单引号&#39;');
});

t('链接文字里的强调不破坏结构', () => {
  const html = inline('[**粗**](https://a.com)');
  assert.ok(html.includes('<a href="https://a.com"') && html.includes('<strong>粗</strong>'), html);
});

t('链接文字里的行内代码', () => {
  const html = inline('[`code`](https://a.com)');
  assert.ok(html.includes('<a href="https://a.com"') && html.includes('<code>code</code>'), html);
});

// ── 摘要 ──────────────────────────────────────────
t('plainText 去掉标记并截断', () => {
  const t1 = plainText('# 标题\n\n**正文** 和 [链接](https://a.com) 结束', 0);
  assert.ok(!t1.includes('#') && !t1.includes('**') && !t1.includes(']'), t1);
  assert.ok(t1.includes('链接'), t1);
  const long = '很长的文字'.repeat(60);
  const t2 = plainText(long, 40);
  assert.ok(t2.length <= 41 && t2.endsWith('…'), `len=${t2.length}`);
});

// ── 边界 ──────────────────────────────────────────
t('空输入', () => {
  assert.strictEqual(toHtml(''), '');
  assert.strictEqual(toHtml('\n\n  \n'), '');
  assert.strictEqual(plainText('', 10), '');
});

t('CRLF 行尾', () => {
  contains('# 标题\r\n\r\n正文', '<h1>标题</h1>');
});

t('渲染耗时正常', () => {
  const doc = ('## 小节\n\n- a\n- b\n\n段落文字 `码` [链](https://a.com)\n\n```\ncode\n```\n\n').repeat(200);
  const t0 = Date.now();
  const html = toHtml(doc);
  const ms = Date.now() - t0;
  assert.ok(html.includes('<h2>'), '渲染结果不完整');
  assert.ok(ms < 2000, `200 段落文档渲染耗时 ${ms}ms`);
});

// ── 报告 ──────────────────────────────────────────
console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) {
  console.log(`\n  ✗ ${f.name}\n    ${f.message}`);
}
process.exit(failures.length ? 1 : 0);
