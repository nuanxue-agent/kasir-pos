import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsPageClient from '@/components/settings/SettingsPageClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) redirect('/dashboard')

  return <SettingsPageClient storeId={storeId} store={store} />
}
