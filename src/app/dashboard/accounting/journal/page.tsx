import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import JournalEntryClient from '@/components/accounting/JournalEntryClient'

export const metadata = { title: 'Jurnal Umum | Kasir' }

export default async function JournalEntryPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <JournalEntryClient storeId={storeId} currency={currency} />
    </div>
  )
}
