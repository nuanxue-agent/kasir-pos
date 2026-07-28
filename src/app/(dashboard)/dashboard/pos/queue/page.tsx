import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import QueueClient from '@/components/pos/QueueClient'

export const metadata = { title: 'Antrian — POS' }

export default async function QueuePage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''

  if (!storeId) redirect('/dashboard')

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <QueueClient storeId={storeId} />
    </main>
  )
}
