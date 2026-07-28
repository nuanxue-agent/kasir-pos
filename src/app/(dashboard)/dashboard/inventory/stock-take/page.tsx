import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import StockTakeClient from '@/components/inventory/StockTakeClient'

interface PageProps {
  searchParams: Promise<{ storeId?: string }>
}

export default async function StockTakePage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const user = session.user as any
  const storeId = sp.storeId ?? user.stores?.[0]?.id

  if (!storeId) redirect('/dashboard')

  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-3)]">Memuat…</div>}>
      <StockTakeClient storeId={storeId} />
    </Suspense>
  )
}
