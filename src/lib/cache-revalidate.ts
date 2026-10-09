import { revalidatePath } from 'next/cache';

/**
 * 按需再验证（on-demand ISR）：后台写库成功后立刻刷新对应前台页面，
 * 不必等 revalidate=60 的周期。
 *
 * 设计：这些函数只在已通过管理员会话校验的 /api/admin/* 路由里调用，
 * 因此无需再管理任何密钥；不要在未鉴权的入口直接调用。
 */

// 核心公共页面：任何“商品 / 价格 / 商城 / 分类 / Banner / 设置”类变更都会影响它们。
const CORE_PATHS = [
  '/',
  '/best-vapes',
  '/news',
];

function revalidateMany(paths: string[]) {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // 单个路径刷新失败不影响其余路径与主写库流程
    }
  }
}

/** 刷新核心公共页面（列表/首页）。 */
export function refreshPublicPages() {
  revalidateMany(CORE_PATHS);
}

/**
 * 刷新核心页面 + 指定产品详情页。
 * slug 未知时只刷新核心页面。
 */
export function refreshProduct(slug?: string | null) {
  refreshPublicPages();
  if (slug) revalidateMany([`/product/${slug}`]);
}

/**
 * 刷新核心页面 + 指定促销聚合页。
 * slug 未知时只刷新核心页面。
 */
export function refreshPromotion(slug?: string | null) {
  refreshPublicPages();
  if (slug) revalidateMany([`/promotion/${slug}`]);
}

/**
 * 刷新内容页（content_pages：best-vapes / news 及其详情页）。
 * type=best_vapes → /best-vapes 与 /best-vapes/{slug}；其余按 news 处理。
 */
export function refreshContentPage(type?: string | null, slug?: string | null) {
  const base = type === 'best_vapes' ? '/best-vapes' : '/news';
  const paths = [base];
  if (slug) paths.push(`${base}/${slug}`);
  revalidateMany(paths);
}

/**
 * 刷新固定页（static_pages：about / privacy / terms 等）。
 * slug 与前台路由同名，仅 about-us 对应 /about。
 */
export function refreshStaticPage(slug?: string | null) {
  if (!slug) return;
  const route = slug === 'about-us' ? '/about' : `/${slug}`;
  revalidateMany([route]);
}



/** 仅刷新首页（轻量场景，如开关/设置）。 */
export function refreshHome() {
  revalidateMany(['/']);
}

/**
 * 整站刷新：刷新根布局及其下所有路由。
 * 用于影响面很广的变更（如商城增删改，会影响全站产品的报价与可见性）。
 */
export function refreshAll() {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // 兜底：整站刷新不可用时，至少刷新核心公共页面
    refreshPublicPages();
  }
}
