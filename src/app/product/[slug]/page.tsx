import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ProductDetailClient, Product } from "@/components/product-detail-client";
import { fetchProductBySlug } from "@/lib/database";
import { isSupabaseConfigured } from "@/storage/database/supabase-client";
import { notFound } from "next/navigation";

// ISR: 每 60 秒重新验证，但跳过构建时预渲染（避免连接海外 Supabase 超时）
export const dynamic = 'force-dynamic';
export const revalidate = 60;

// 服务端获取产品数据
async function getProduct(slug: string) {
  // 构建时可能没有 Supabase 环境变量
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const product = await fetchProductBySlug(slug, "en");
    return product;
  } catch (error) {
    console.error("Failed to fetch product:", error);
    return null;
  }
}

// 详情页骨架屏
function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />
      <div className="mx-auto max-w-[1380px] px-4 py-8 bg-white flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 rounded bg-gray-100 animate-pulse" />
            <div className="h-12 w-1/3 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

// 详情页未找到
function ProductNotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />
      <div className="min-h-[50vh] flex items-center justify-center bg-white flex-1">
        <div className="text-center">
          <p className="text-lg text-gray-400">Product not found</p>
          <Link href="/" className="mt-4 inline-block text-purple-700 hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="vape-deals" />
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailClient product={product as Product} />
      </Suspense>
    </div>
  );
}