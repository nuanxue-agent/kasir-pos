import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import SkillsMatrixClient from '@/components/hr/SkillsMatrixClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ensureSkillsTables } from '@/app/api/hr/skills/route'

export const metadata = { title: 'Matriks Kompetensi — HR' }

export default async function SkillsMatrixPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  await ensureSkillsTables()

  const employees = await query(
    `SELECT id, name, role FROM Employee WHERE storeId = ? ORDER BY name ASC`,
    [store.id],
  )

  return (
    <Suspense fallback={<PageSkeleton />}>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <SkillsMatrixClient storeId={store.id} employees={employees as any[]} />
      </main>
    </Suspense>
  )
}
