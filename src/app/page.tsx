import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ProductListClient, InitialData } from "@/components/product-list-client";
import { fetchCategories, fetchProducts, fetchBanners } from "@/lib/database";
import { isSupabaseConfigured, getSupabaseClient } from "@/storage/database/supabase-client";
import { getPresignedUrl } from "@/lib/storage";

// ISR: 每 60 秒重新验证，但跳过构建时预渲染（避免连接海外 Supabase 超时）
export const dynamic = 'force-dynamic';
export const revalidate = 60;

// 服务端获取初始数据
async function getInitialData() {
  // 构建时可能没有 Supabase 环境变量，直接返回空数据
  if (!isSupabaseConfigured()) {
    return {
      categories: [],
      products: [],
      featuredProducts: [],
      banners: [],
      promotions: [],
      promotionProducts: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  }

  try {
    const supabase = getSupabaseClient();
    
    // ISR 自身已缓存页面，无需 unstable_cache 双重缓存
    const [categories, products, featuredProducts, bannersData, promotionsResult] = await Promise.all([
      fetchCategories("en"),
      fetchProducts({ language: "en", limit: 20, offset: 0 }),
      fetchProducts({ language: "en", limit: 5, offset: 0, featured: true }),
      fetchBanners("en"),
      // 获取 promotions
      supabase
        .from("promotions")
        .select(`
          id,
          slug,

          is_active,
          sort_order,
          time_type,
          start_time,
          end_time,
          countdown_action,
          promotion_translations (
            id,
            language,
            name,
            cover_image_key,
            cover_image_url
          )
        `)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(8),
    ]);

    // 处理 banners - 转换 image_key 为签名 URL (需要 await)
    const banners = await Promise.all(bannersData.map(async (banner: any) => {
      const translation = banner.translations?.find((t: any) => t.language === "en") || banner.translations?.[0];
      return {
        id: banner.id,
        image_url: await getPresignedUrl(banner.image_key),
        mobile_image_url: await getPresignedUrl(banner.mobile_image_key),
        // 优先使用翻译中的图片
        translated_image_url: await getPresignedUrl(translation?.image_key),
        translated_mobile_image_url: await getPresignedUrl(translation?.mobile_image_key),
        link_url: banner.link_url,
        title: translation?.title || null,
        subtitle: translation?.subtitle || null,
      };
    }));

    // 处理 promotions
    const promotions = promotionsResult.data?.map((promo: any) => ({
      id: promo.id,
      slug: promo.slug,
      is_active: promo.is_active,
      sort_order: promo.sort_order,
      time_type: promo.time_type,
      start_time: promo.start_time,
      end_time: promo.end_time,
      countdown_action: promo.countdown_action,
      translations: promo.promotion_translations || [],
      product_count: 0,
    })) || [];

    // 获取活动产品数据 (promotion products)
    const promotionIds = promotions.map((p: any) => p.id);
    let promotionProducts: any[] = [];
    if (promotionIds.length > 0) {
      const { data: ppData } = await supabase
        .from("promotion_products")
        .select(`
          id,
          promotion_id,
          slug,
          image_key,
          image_url,
          is_active,
          is_featured,
          special_price,
          notes,
          promotion_product_translations (
            id,
            name,
            description,
            language
          )
        `)
        .in("promotion_id", promotionIds)
        .eq("is_active", true);

      if (ppData && ppData.length > 0) {
        // 获取每个活动产品的价格
        const ppIds = ppData.map((pp: any) => pp.id);
        const { data: ppPrices } = await supabase
          .from("promotion_product_prices")
          .select(`
            id,
            promotion_product_id,
            store_id,
            current_price,
            original_price,
            currency,
            region,
            no_quote,
            special_price,
            time_type,
            start_time,
            end_time,
            countdown_action,
            product_url
          `)
          .in("promotion_product_id", ppIds);

        // 获取店铺信息
        const storeIds = [...new Set((ppPrices || []).map((p: any) => p.store_id).filter(Boolean))];
        let storesMap: Record<number, any> = {};
        if (storeIds.length > 0) {
          const { data: storesData } = await supabase
            .from("stores")
            .select("id, slug, logo_url, is_active, store_translations(id, store_id, language, name)")
            .in("id", storeIds);
          (storesData || []).forEach((s: any) => { storesMap[s.id] = s; });
        }

        // 组装活动产品数据
        promotionProducts = ppData.map((pp: any) => {
          const prices = (ppPrices || [])
            .filter((p: any) => p.promotion_product_id === pp.id)
            .map((p: any) => ({
              ...p,
              store: storesMap[p.store_id] || null,
            }));
          return {
            ...pp,
            store_prices: prices,
          };
        });
      }
    }

    // 计算总数
    const countResult = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    
    const total = countResult.count || 0;

    return {
      categories: categories || [],
      products: products || [],
      featuredProducts: featuredProducts || [],
      banners,
      promotions,
      promotionProducts,
      pagination: {
        page: 1,
        limit: 20,
        total,
        totalPages: Math.ceil(total / 20),
      },
    };
  } catch (error) {
    console.error("Failed to fetch initial data:", error);
    return {
      categories: [],
      products: [],
      featuredProducts: [],
      banners: [],
      promotions: [],
      promotionProducts: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  }
}

// 首页骨架屏
function HomePageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-16 bg-[#0a0a0e]" />
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 pt-6 pb-6">
          {/* Banner skeleton */}
          <div className="mb-8 h-[200px] sm:h-[343px] bg-gradient-to-r from-purple-900 via-purple-800 to-cyan-900 rounded-2xl animate-pulse" />
          
          {/* Filter skeleton */}
          <div className="mb-6 space-y-3">
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-7 w-16 rounded-full bg-gray-100 animate-pulse" />
              ))}
            </div>
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-7 w-20 rounded-full bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>

          {/* Product grid skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 animate-pulse">
                <div className="h-48 w-full rounded-xl bg-gray-100" />
                <div className="mt-4 h-4 w-3/4 rounded bg-gray-100" />
                <div className="mt-2 h-6 w-1/2 rounded bg-gray-100" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 w-full rounded bg-gray-100" />
                  <div className="h-8 w-full rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default async function HomePage() {
  const initialData = await getInitialData();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="vape-deals" />
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 pt-0 sm:pt-6 pb-6">
          <Suspense fallback={<HomePageSkeleton />}>
            <ProductListClient initialData={initialData as unknown as InitialData} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}