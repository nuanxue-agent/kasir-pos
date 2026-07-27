import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DeveloperPortalClient from '@/components/settings/DeveloperPortalClient'

export const metadata = { title: 'Developer Portal' }

export default async function DeveloperPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const role = user.stores?.[0]?.role ?? ''

  if (!['OWNER', 'SUPERADMIN'].includes(role)) {
    redirect('/dashboard/settings')
  }

  return (
    <div className="mx-auto max-w-screen-lg space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-lg font-bold text-[var(--text-1)]">Developer Portal</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Kelola API key, dokumentasi endpoint, dan konfigurasi webhook untuk integrasi eksternal.
        </p>
      </div>
      <DeveloperPortalClient storeId={storeId} />
    </div>
  )
}
