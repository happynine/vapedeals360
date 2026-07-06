export default function PromotionDetailLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header skeleton */}
      <div className="h-16 bg-[#0a0a0e]" />
      
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 pt-6 pb-12">
          {/* Title skeleton */}
          <div className="mb-4">
            <div className="h-10 w-3/4 rounded bg-gray-200 animate-pulse" />
          </div>
          
          {/* Description skeleton */}
          <div className="mb-4 space-y-2">
            <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
          </div>
          
          {/* Product count badge skeleton */}
          <div className="mb-6">
            <div className="inline-block h-6 w-20 rounded-full bg-gray-100 animate-pulse" />
          </div>
          
          {/* Product grid skeleton - 2 products for typical promotion */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
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
      
      {/* Footer skeleton */}
      <div className="h-40 bg-[#0a0a0e]" />
    </div>
  );
}