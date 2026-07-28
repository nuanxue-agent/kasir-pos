import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import OrgChartClient from '@/components/hr/OrgChartClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ensureOrgPositionTable } from '@/app/api/hr/org-positions/route'

export const metadata = { title: 'Struktur Organisasi — HR' }

export default async function OrgChartPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  await ensureOrgPositionTable()

  const employees = await query(
    `SELECT id, name, role FROM Employee WHERE storeId = ? ORDER BY name ASC`,
    [store.id],
  )

  return (
    <Suspense fallback={<PageSkeleton />}>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <OrgChartClient storeId={store.id} employees={employees as any[]} />
      </main>
    </Suspense>
  )
}
