import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SettingsPageClient from '@/components/settings/SettingsPageClient'


export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const storeId = (session.user as any).stores?.[0]?.id ?? ''
  const currency = (session.user as any).stores?.[0]?.currency ?? 'IDR'
  return <SettingsPageClient storeId={storeId} session={session} currency={currency} />
}
