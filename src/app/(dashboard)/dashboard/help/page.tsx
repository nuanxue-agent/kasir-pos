import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HelpCenterClient from '@/components/help/HelpCenterClient'

export const metadata = { title: 'Pusat Bantuan' }

export default async function HelpPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <HelpCenterClient />
}
