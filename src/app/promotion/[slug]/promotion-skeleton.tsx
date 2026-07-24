export function PromotionSkeleton() {
  return (
    <div className="animate-pulse">
      {/* 标题骨架 */}
      <div className="h-10 bg-gray-200 rounded w-1/3 mb-4"></div>
      {/* 简介骨架 */}
      <div className="space-y-2 mb-6">
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
      {/* 产品数量骨架 */}
      <div className="h-6 bg-gray-200 rounded w-20 mb-6"></div>
      {/* 产品卡片网格骨架 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="aspect-[4/3] bg-gray-200"></div>
            <div className="p-4 space-y-3">
              <div className="h-5 bg-gray-200 rounded w-3/4"></div>
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}