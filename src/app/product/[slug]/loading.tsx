export default function ProductLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header skeleton */}
      <div className="h-16 bg-[#0a0a0e]" />
      
      <main className="flex-1 bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb skeleton */}
          <div className="mb-4 h-4 w-32 rounded bg-gray-100 animate-pulse" />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Image skeleton */}
            <div className="space-y-4">
              <div className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="w-20 h-20 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            </div>
            
            {/* Info skeleton */}
            <div className="space-y-6">
              <div className="h-8 w-3/4 rounded bg-gray-100 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
              </div>
              
              {/* Price table skeleton */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-gray-100 animate-pulse" />
                        <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-16 rounded bg-gray-100 animate-pulse" />
                        <div className="h-8 w-20 rounded bg-purple-100 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Specs skeleton */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="h-5 w-20 rounded bg-gray-100 animate-pulse mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                      <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}