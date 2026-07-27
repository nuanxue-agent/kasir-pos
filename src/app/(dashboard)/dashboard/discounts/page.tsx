import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import DiscountsPageClient from '@/components/discounts/DiscountsPageClient'

export default async function DiscountsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { currency: true } })

  return (
    <DiscountsPageClient
      storeId={storeId}
      currency={store?.currency ?? 'IDR'}
    />
  )
}
