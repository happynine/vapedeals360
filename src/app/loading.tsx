export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header placeholder */}
      <div className="h-16 bg-[#0a0a0e]" />
      
      {/* Centered loading spinner - works for ALL pages */}
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* Spinner */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-purple-600 border-t-transparent animate-spin"></div>
          </div>
          {/* Loading text */}
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </main>
      
      {/* Footer placeholder */}
      <div className="h-40 bg-[#0a0a0e]" />
    </div>
  );
}