import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import CustomDashboardClient from '@/components/dashboard/CustomDashboardClient'
import { deserializeWidgets } from '@/lib/custom-dashboard'

export const metadata = { title: 'Custom Dashboard — Dashboard' }

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS DashboardLayout (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    userId    TEXT NOT NULL,
    name      TEXT NOT NULL,
    widgets   TEXT NOT NULL DEFAULT '[]',
    isDefault INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export default async function CustomDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any

  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const userId: string = user.id ?? user.email ?? ''

  await ensureTable()

  const rows = await query(
    `SELECT * FROM DashboardLayout WHERE storeId = ? AND userId = ? ORDER BY isDefault DESC, createdAt DESC`,
    [storeId, userId],
  ) as any[]

  const layouts = rows.map(row => ({
    ...row,
    isDefault: Boolean(row.isDefault),
    widgets: deserializeWidgets(row.widgets),
  }))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CustomDashboardClient
        storeId={storeId}
        userId={userId}
        initialLayouts={layouts}
      />
    </main>
  )
}
