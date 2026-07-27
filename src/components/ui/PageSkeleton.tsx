export function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-[var(--bg-muted)] rounded-lg w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-[var(--bg-muted)] rounded-xl" />)}
      </div>
      <div className="h-64 bg-[var(--bg-muted)] rounded-xl" />
    </div>
  )
}
