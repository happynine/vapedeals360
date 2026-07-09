import { Suspense } from 'react';
import { SiteHeader } from '@/components/site-header';
import { PromotionContent } from './promotion-content';
import { PromotionSkeleton } from './promotion-skeleton';

// Server Component - fetches data on the server
export default async function PromotionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<PromotionSkeleton />}>
          <PromotionContent slug={slug} />
        </Suspense>
      </main>
    </div>
  );
}