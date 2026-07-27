import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard/DashboardShell'


export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { user } = session

  return (
    <DashboardShell
      userName={user.name ?? 'User'}
      userEmail={user.email}
      userImage={user.image ?? null}
      userRole={user.role}
      isSuperAdmin={user.isSuperAdmin}
      stores={user.stores ?? []}
    >
      {children}
    </DashboardShell>
  )
}
