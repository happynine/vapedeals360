import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ProductListClient, InitialData } from "@/components/product-list-client";
import { fetchCategoriesCached, fetchProducts, fetchBannersCached } from "@/lib/database";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getPresignedUrl } from "@/lib/storage";

// ISR: 每 60 秒重新验证
export const revalidate = 60;

// 服务端获取初始数据
async function getInitialData() {
  const supabase = getSupabaseClient();
  
  try {
    // 使用缓存版本获取分类和 banners，并行获取所有数据
    const [categories, products, featuredProducts, bannersData] = await Promise.all([
      fetchCategoriesCached("en"),
      fetchProducts({ language: "en", limit: 20, offset: 0 }),
      fetchProducts({ language: "en", limit: 5, offset: 0, featured: true }),
      fetchBannersCached("en"),
    ]);

    // 处理 banners - 转换 image_key 为签名 URL
    const banners = bannersData.map((banner: any) => {
      const translation = banner.translations?.find((t: any) => t.language === "en") || banner.translations?.[0];
      return {
        id: banner.id,
        image_url: banner.image_key ? getPresignedUrl(banner.image_key) : null,
        mobile_image_url: banner.mobile_image_key ? getPresignedUrl(banner.mobile_image_key) : null,
        // 优先使用翻译中的图片
        translated_image_url: translation?.image_key ? getPresignedUrl(translation.image_key) : null,
        translated_mobile_image_url: translation?.mobile_image_key ? getPresignedUrl(translation.mobile_image_key) : null,
        link_url: banner.link_url,
        title: translation?.title || null,
        subtitle: translation?.subtitle || null,
      };
    });

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
            <ProductListClient initialData={initialData as InitialData} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}