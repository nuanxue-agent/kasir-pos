import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DigitalMenuClient from '@/components/pos/DigitalMenuClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Menu Digital' }

export default async function DigitalMenuPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId = store?.id ?? ''
  // Derive a URL-safe slug from the store name or fall back to storeId
  const storeSlug = store?.slug ?? store?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? storeId

  return (
    <Suspense fallback={<PageSkeleton />}>
      <DigitalMenuClient storeId={storeId} storeSlug={storeSlug} />
    </Suspense>
  )
}
