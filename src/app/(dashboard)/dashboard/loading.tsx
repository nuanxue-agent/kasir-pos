export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto animate-pulse">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-gray-200 rounded-lg" />
        <div className="h-4 w-72 bg-gray-100 rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2 py-0.5">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-7 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders skeleton */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
            <div className="h-5 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
          </div>
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex gap-4 items-center">
                <div className="h-4 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
                <div className="ml-auto h-4 w-20 bg-gray-100 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column skeleton */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
          </div>

          {/* Low stock */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="h-5 w-24 bg-gray-200 rounded" />
            </div>
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                  <div className="h-5 w-12 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
