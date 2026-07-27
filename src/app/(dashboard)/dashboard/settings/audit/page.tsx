import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AuditLogClient from '@/components/settings/AuditLogClient'

export const metadata = { title: 'Log Aktivitas' }

export default async function AuditPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const role = user.stores?.[0]?.role ?? ''

  // OWNER / SUPERADMIN only
  if (!['OWNER', 'SUPERADMIN'].includes(role)) {
    redirect('/dashboard/settings')
  }

  return (
    <div className="mx-auto max-w-screen-lg space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-lg font-bold text-[var(--text-1)]">Log Aktivitas</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Riwayat lengkap semua aksi yang dilakukan di toko ini.
        </p>
      </div>
      <AuditLogClient storeId={storeId} />
    </div>
  )
}
