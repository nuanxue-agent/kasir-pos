import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DocumentClient from '@/components/documents/DocumentClient'

export default async function DocumentsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <DocumentClient storeId={store.id} />
}
