import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import type { UserRole } from '@/lib/permissions'


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

 // New users who haven't completed onboarding
 if (!(user as any).onboarded) {
 redirect('/onboarding')
 }

 return (
 <DashboardShell
 userName={user.name ?? 'User'}
 userEmail={user.email}
 userImage={user.image ?? null}
 userRole={user.role as UserRole}
 isSuperAdmin={user.isSuperAdmin ?? false}
 stores={user.stores ?? []}
 modules={user.stores?.[0]?.modules ?? ['pos','inventory','customers','discounts','reports']}
 >
 {children}
 </DashboardShell>
 )
}
