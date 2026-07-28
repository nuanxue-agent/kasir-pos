import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BPJSAdminClient from '@/components/hr/BPJSAdminClient'
import { ensureBPJSTables } from '@/app/api/hr/bpjs/enrollments/route'

export const metadata = { title: 'Administrasi BPJS — HR' }

export default async function BPJSAdminPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureBPJSTables()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BPJSAdminClient storeId={storeId} />
    </main>
  )
}
