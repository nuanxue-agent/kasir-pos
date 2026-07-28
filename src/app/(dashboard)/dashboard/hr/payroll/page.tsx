import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import PayrollClient from '@/components/hr/PayrollClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ensurePayrollTables } from '@/app/api/payroll/route'

export const metadata = { title: 'Payroll — HR' }

export default async function PayrollPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensurePayrollTables()

  const periods = await query(
    `SELECT * FROM PayrollPeriod WHERE storeId = ? ORDER BY period DESC`,
    [storeId],
  ).catch(() => []) as any[]

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <Suspense fallback={<PageSkeleton />}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PayrollClient
          storeId={storeId}
          currency={currency}
          initialPeriods={periods}
        />
      </main>
    </Suspense>
  )
}
