# 项目上下文

## 项目概述

VapeDeal - 电子烟比价网站，提供多商城价格对比、降价信息展示、多语言支持及后台管理系统。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4 (暗色主题)
- **Database**: Supabase (PostgreSQL)
- **ORM/迁移**: Drizzle (仅用于 schema 定义 + `coze-coding-ai db upgrade`)

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/
│   │   ├── layout.tsx      # 根布局 (暗色主题)
│   │   ├── page.tsx        # 首页 - 产品列表
│   │   ├── globals.css     # 全局样式 (暗色配色)
│   │   ├── product/[slug]/page.tsx  # 产品详情页
│   │   ├── admin/page.tsx  # 后台管理系统
│   │   └── api/
│   │       ├── products/route.ts           # GET 产品列表
│   │       ├── products/[slug]/route.ts    # GET 产品详情
│   │       └── admin/
│   │           ├── categories/route.ts     # CRUD 分类
│   │           ├── stores/route.ts         # CRUD 商城
│   │           ├── products/route.ts       # CRUD 产品
│   │           ├── prices/route.ts         # CRUD 价格
│   │           └── seed/route.ts           # POST 种子数据
│   ├── components/ui/      # shadcn/ui 组件库
│   ├── hooks/
│   ├── lib/
│   │   ├── utils.ts        # 通用工具 (cn)
│   │   └── database.ts     # 数据库查询辅助函数
│   └── storage/database/
│       ├── supabase-client.ts  # Supabase 客户端
│       └── shared/schema.ts    # Drizzle 表结构定义
├── DESIGN.md               # 设计规范
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 数据库结构

7 张核心表，支持多语言 (translation 模式)：

| 表 | 用途 | 多语言 |
|---|---|---|
| categories | 产品分类 | category_translations |
| stores | 商城信息 | store_translations |
| products | 产品主表 | product_translations |
| product_prices | 产品价格 (每商城) | - |
| health_check | 系统表 | - |

## API 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | /api/products | 产品列表 (分页、分类筛选) |
| GET | /api/products/[slug] | 产品详情 |
| GET/POST/PUT/DELETE | /api/admin/categories | 分类 CRUD |
| GET/POST/PUT/DELETE | /api/admin/stores | 商城 CRUD |
| GET/POST/PUT/DELETE | /api/admin/products | 产品 CRUD |
| GET/POST/PUT/DELETE | /api/admin/prices | 价格 CRUD |
| POST | /api/admin/seed | 种子数据 |

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 开发规范

- 默认按 TypeScript `strict` 心智写代码
- 禁止隐式 `any` 和 `as any`
- 字段名统一 snake_case (Supabase SDK 规范)
- 所有 Supabase 操作必须检查 `{ data, error }` 并 throw
- `.delete()` / `.update()` 必须带 filter

### Hydration 问题防范

- 使用 'use client' + useEffect + useState 处理动态数据
- 禁止在 JSX 中直接使用 typeof window / Date.now() / Math.random()

### 数据库操作

- 使用 `getSupabaseClient()` (服务端，绕过 RLS)
- 禁止使用 Drizzle ORM 语法做查询，仅用于 schema 定义
- `coze-coding-ai db generate-models` → 修改 schema.ts → `coze-coding-ai db upgrade`

## 构建与运行

```bash
pnpm install          # 安装依赖
pnpm run dev          # 开发模式 (端口 5000)
pnpm run build        # 构建
pnpm run start        # 生产模式
```
