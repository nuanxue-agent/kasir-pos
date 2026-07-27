import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CashRegisterClient from '@/components/pos/CashRegisterClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Kasir — Buka/Tutup Shift' }

export default async function CashRegisterPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId = store?.id ?? ''
  const currency = store?.currency ?? 'IDR'
  const employeeName: string = user.name ?? user.email ?? 'Kasir'

  return (
    <Suspense fallback={<PageSkeleton />}>
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-stone-800">Kasir</h1>
            <p className="text-sm text-stone-500 mt-0.5">Buka &amp; tutup shift, mutasi kas harian</p>
          </div>
          <CashRegisterClient
            storeId={storeId}
            currency={currency}
            employeeName={employeeName}
          />
        </div>
      </div>
    </Suspense>
  )
}
