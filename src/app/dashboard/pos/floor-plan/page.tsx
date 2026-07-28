import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FloorPlanClient from '@/components/pos/FloorPlanClient'

export const metadata = { title: 'Denah Lantai — POS' }

export default async function FloorPlanPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''

  if (!storeId) redirect('/dashboard')

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <FloorPlanClient storeId={storeId} editable />
    </main>
  )
}
