import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType, ShadingType } from 'docx';
import * as fs from 'fs';

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Microsoft YaHei', size: 22 },
      },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } },
      },
      children: [
        // Title
        new Paragraph({
          children: [new TextRun({ text: 'VapeDeal 网站运维与安全规划', bold: true, size: 36, color: '7c3aed' })],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),

        // ===== Section 1 =====
        heading('一、什么时候需要买服务器'),
        bodyText('当前架构为 Serverless/托管服务（Vercel + Supabase + Vercel Blob），初期完全正确。需自建服务器的信号：'),
        createTable(
          ['信号', '阈值', '说明'],
          [
            ['Vercel 费用飙升', '月费超过 $200+', 'Serverless 按调用计费，高流量下自建更划算'],
            ['API 响应慢', 'Supabase 免费额用尽 / 冷启动频繁', '免费版 500MB 存储、5万行/月，超出后需升级或迁移'],
            ['需要定时爬虫', '实时抓取多商城价格', 'Vercel Serverless 有 10s 执行上限，爬虫需长连接'],
            ['需要后台常驻进程', '价格监控、告警推送', 'Serverless 不适合 7x24 运行的任务'],
            ['数据合规', '用户数据需存储在特定地区', '自建可控制数据物理位置'],
          ]
        ),
        bodyText('建议路线：先升级 Vercel/Supabase 付费版（$20/月起），日 PV 过 5 万再考虑自建。', true),

        // ===== Section 2 =====
        heading('二、安全考虑（现在就该做）'),
        subHeading('已有的风险'),
        bulletPoint('后台管理无登录验证 — 任何人访问 /admin 都能操作数据', true),
        bulletPoint('API 无鉴权 — /api/admin/* 无需任何身份认证', true),
        bulletPoint('Supabase service_role key 暴露 — 绕过 RLS，一旦泄露等于数据库裸奔', true),

        subHeading('立即要做的（P0）'),
        bulletPoint('后台登录认证：接入 Supabase Auth（项目已配置好，需启用）'),
        bulletPoint('Admin API 鉴权：校验 x-session token，未登录返回 401'),
        bulletPoint('环境变量安全：确保 SUPABASE_SERVICE_ROLE_KEY 不出现在前端代码中'),
        bulletPoint('Rate Limiting：防止 API 被暴力调用'),

        subHeading('短期要做的（P1）'),
        bulletPoint('HTTPS 强制：Vercel 默认支持，确保所有请求走 HTTPS'),
        bulletPoint('CSP 策略：防止 XSS 注入（富文本是高风险区）'),
        bulletPoint('输入验证：服务端对所有用户输入做长度、格式校验'),
        bulletPoint('SQL 注入防护：当前用 Supabase SDK 参数化查询，风险较低'),

        subHeading('中期要做的（P2）'),
        bulletPoint('WAF（Web 应用防火墙）：Cloudflare 免费版即可'),
        bulletPoint('DDoS 防护：Vercel 自带基础防护，Cloudflare 增强版更好'),
        bulletPoint('日志审计：记录后台操作日志，追踪谁改了什么'),

        // ===== Section 3 =====
        heading('三、合规与法律（电子烟行业尤为重要）'),
        createTable(
          ['事项', '重要性', '说明'],
          [
            ['年龄验证', '极高', '多数国家要求访问前确认年龄（21+/18+）'],
            ['FDA 合规', '极高', '面向美国市场需符合 FDA 电子烟法规'],
            ['Disclaimer', '高', '已有 FDA/NIXODINE 免责声明，建议法律审核'],
            ['隐私政策/GDPR', '高', '收集用户数据（如 IP）需合规'],
            ['COPPA', '高', '不得收集未成年人数据'],
            ['广告法', '中', '比价内容不能构成诱导购买'],
            ['Cookie 合规', '中', '欧盟用户需 Cookie 同意弹窗'],
          ]
        ),

        // ===== Section 4 =====
        heading('四、业务增长需考虑的方面'),
        subHeading('技术侧'),
        createTable(
          ['方面', '现状', '需要补的'],
          [
            ['SEO', 'SSR 已有基础', 'Sitemap、结构化数据(Schema.org)、Canonical URL、Open Graph'],
            ['性能监控', '无', '接入 Vercel Analytics 或 Google Analytics'],
            ['错误监控', '无', 'Sentry / LogRocket'],
            ['CDN', 'Vercel 自带', '够用，图片可考虑 Cloudflare R2 更便宜'],
            ['备份', '无', 'Supabase 自动备份（Pro 版），自建需定时 dump'],
            ['搜索', '前端过滤', '文章多了需全文搜索（Supabase pg_trgm 或 Algolia）'],
            ['缓存', '无', 'Redis 缓存热门产品数据，减少数据库查询'],
          ]
        ),
        subHeading('运营侧'),
        createTable(
          ['方面', '说明'],
          [
            ['数据来源自动化', '目前手动录入价格，需爬虫自动抓取商城价格'],
            ['价格历史图表', '记录价格变动趋势，增强"比价"价值'],
            ['邮件订阅', '降价提醒、新品推送（Resend / SendGrid）'],
            ['社交分享', 'OG 图片、分享按钮、社交账号引流'],
            ['Affiliate 链接', '核心变现方式，商城跳转带追踪参数'],
            ['多语言 SEO', '每种语言独立 URL，hreflang 标签'],
          ]
        ),

        // ===== Section 5 =====
        heading('五、优先级建议'),
        subHeading('现在（0 成本）'),
        bulletPoint('后台登录认证 + API 鉴权'),
        bulletPoint('年龄验证弹窗'),
        bulletPoint('隐私政策完善'),

        subHeading('1-3 个月（低成本）'),
        bulletPoint('升级 Supabase Pro ($25/月)'),
        bulletPoint('接入 Analytics + 错误监控'),
        bulletPoint('SEO 优化 (Sitemap, Schema.org)'),
        bulletPoint('Cloudflare WAF (免费版)'),

        subHeading('3-6 个月（按需投入）'),
        bulletPoint('价格爬虫自动化'),
        bulletPoint('邮件订阅/降价提醒'),
        bulletPoint('Affiliate 对接'),
        bulletPoint('Redis 缓存层'),

        subHeading('6 个月+（规模化）'),
        bulletPoint('自建服务器（如需爬虫常驻）'),
        bulletPoint('全文搜索'),
        bulletPoint('价格历史数据'),
      ],
    },
  ],
});

function heading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 30, color: '1a1a2e' })],
    spacing: { before: 400, after: 200 },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: '7c3aed' })],
    spacing: { before: 300, after: 100 },
  });
}

function bodyText(text: string, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, bold })],
    spacing: { after: 150 },
  });
}

function bulletPoint(text: string, highlight = false) {
  return new Paragraph({
    children: [
      new TextRun({ text: '• ', size: 22 }),
      new TextRun({ text, size: 22, bold: highlight, color: highlight ? 'dc2626' : '000000' }),
    ],
    spacing: { after: 80 },
  });
}

function createTable(headers: string[], rows: string[][]) {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: 'ffffff' })] })],
      shading: { type: ShadingType.SOLID, color: '7c3aed' },
      width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
    })),
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: row.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20 })] })],
      shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: 'f3f4f6' } : undefined,
      width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
    })),
  }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
}

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/workspace/projects/public/vapedeals-ops-plan.docx', buffer);
  console.log('Done! File saved to public/vapedeals-ops-plan.docx');
});
