'use strict';

/**
 * 站点配置 —— 改这里就能换站名、域名、副标题。
 * 部署时建议用环境变量覆盖 url：SITE_URL=https://blog.example.com
 */

module.exports = {
  // 站名（显示在页头 / <title> / RSS）
  title: '彼得的笔记',

  // 一句话副标题（页头小字）
  tagline: '折腾服务器、写点代码、随手记下来。',

  // 用于 SEO 描述与 RSS description
  description:
    '个人博客，记录 Linux、NAS、网络与一些自写的工具。纯 Node.js 编写，零依赖。',

  // 站点绝对地址，不带结尾斜杠。RSS/sitemap 里所有链接都基于它。
  url: process.env.SITE_URL || 'http://localhost:4000',

  // 作者名（RSS 的 <author> 与 footer）
  author: 'Peter',

  // 首页每页显示多少篇文章（列表不分页，超过后折叠为「更早的文章」）
  postsPerPage: 10,

  // 摘要字数上限
  excerptLength: 140,
};
