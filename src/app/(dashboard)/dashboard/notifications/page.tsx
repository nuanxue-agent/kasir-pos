import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { NotificationCenterClient } from '@/components/notifications/NotificationCenterClient'

export const metadata = {
  title: 'Notifikasi | Kasir App',
  description: 'Pusat notifikasi dan pengaturan pemberitahuan',
}

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string | undefined = user.activeStoreId ?? user.stores?.[0]?.id ?? undefined

  return <NotificationCenterClient storeId={storeId} />
}
