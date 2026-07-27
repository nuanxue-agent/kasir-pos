export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-stone-100 rounded-xl" />
          <div className="h-4 w-32 bg-stone-50 rounded-lg" />
        </div>
        <div className="h-10 w-28 bg-stone-100 rounded-xl" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-stone-50 rounded-2xl" />
        ))}
      </div>

      {/* Chart area */}
      <div className="h-64 bg-stone-50 rounded-2xl" />

      {/* Table skeleton */}
      <div className="bg-stone-50 rounded-2xl p-4 space-y-3">
        <div className="h-5 w-32 bg-stone-100 rounded-lg" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-white rounded-xl" />
        ))}
      </div>
    </div>
  )
}
