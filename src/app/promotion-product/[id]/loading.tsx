export default function PromotionProductLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header skeleton */}
      <div className="h-16 bg-[#0a0a0e]" />
      
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
          {/* Product detail layout skeleton - image + details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Product image skeleton */}
            <div className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
            
            {/* Product details skeleton */}
            <div className="space-y-4">
              {/* Title skeleton */}
              <div className="h-8 w-3/4 rounded bg-gray-100 animate-pulse" />
              
              {/* Price skeleton */}
              <div className="h-12 w-1/3 rounded bg-gray-100 animate-pulse" />
              
              {/* Description skeleton */}
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
              </div>
              
              {/* Store prices skeleton */}
              <div className="mt-6 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 animate-pulse">
                    <div className="h-8 w-8 rounded bg-gray-100" />
                    <div className="h-4 w-20 rounded bg-gray-100" />
                    <div className="h-6 w-16 rounded bg-gray-100" />
                    <div className="h-8 w-20 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer skeleton */}
      <div className="h-40 bg-[#0a0a0e]" />
    </div>
  );
}