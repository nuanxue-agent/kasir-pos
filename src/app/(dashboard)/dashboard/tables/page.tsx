import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TableManagementClient from '@/components/tables/TableManagementClient'

export const metadata = { title: 'Manajemen Meja' }

export default async function TablesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <TableManagementClient />
}
