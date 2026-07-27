'use client'

export function LoyaltyPageClient({ storeId, currency }: { storeId: string; currency: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-stone-800">Loyalty Program</h1>
      <p className="text-stone-400 mt-1 text-sm">Loading...</p>
    </div>
  )
}
