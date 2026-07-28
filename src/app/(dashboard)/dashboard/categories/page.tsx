import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CategoriesPageClient from '@/components/categories/CategoriesPageClient'

export default async function CategoriesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  return <CategoriesPageClient storeId={storeId} />
}
