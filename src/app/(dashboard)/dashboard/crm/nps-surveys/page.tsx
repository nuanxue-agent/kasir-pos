import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NPSSurveyClient from '@/components/crm/NPSSurveyClient'

export const metadata = { title: 'Survei NPS | Kasir' }

export default async function NPSSurveyPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId: string = user.storeId ?? user.id

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <NPSSurveyClient storeId={storeId} />
    </div>
  )
}
