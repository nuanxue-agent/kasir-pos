import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { ensureShiftScheduleTables } from '@/app/api/hr/shift-schedules/route'
import ShiftPlannerClient from '@/components/hr/ShiftPlannerClient'

export const metadata = { title: 'Jadwal Shift — HR' }

export default async function ShiftPlannerPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  await ensureShiftScheduleTables()

  const [employeesRaw, shiftsRaw] = await Promise.all([
    query(
      `SELECT id, name FROM Employee WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [store.id],
    ).catch(() => []),
    query(
      `SELECT id, name, startTime, endTime FROM Shift WHERE storeId = ? ORDER BY startTime ASC`,
      [store.id],
    ).catch(() => []),
  ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ShiftPlannerClient
        storeId={store.id}
        initialEmployees={employeesRaw as any[]}
        initialShifts={shiftsRaw as any[]}
      />
    </main>
  )
}
