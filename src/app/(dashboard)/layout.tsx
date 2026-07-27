import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import type { StoreShell } from '@/components/dashboard/DashboardShell'
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

 // Fetch full store objects from DB for the tenant
 const tenantId = (user as any).tenantId as string | undefined
 let fullStores: StoreShell[] = []

 if (tenantId) {
  const rows = await query(
   `SELECT id, name, address, phone, currency, timezone, taxRate, receiptNote
    FROM Store WHERE tenantId = ? AND active = 1 ORDER BY name`,
   [tenantId]
  ) as any[]

  // Merge DB fields with session store data (modules live in the JWT)
  const sessionStores: Array<{ id: string; modules?: string[] }> = (user as any).stores ?? []
  const moduleMap = new Map(sessionStores.map(s => [s.id, s.modules ?? []]))

  fullStores = rows.map(row => ({
   id: row.id,
   name: row.name,
   address: row.address ?? undefined,
   phone: row.phone ?? undefined,
   currency: row.currency ?? 'IDR',
   timezone: row.timezone ?? 'Asia/Jakarta',
   taxRate: row.taxRate ?? 0,
   receiptNote: row.receiptNote ?? undefined,
   modules: moduleMap.get(row.id) ?? ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  }))
 }

 // Fallback: use session stores if DB query yielded nothing
 if (fullStores.length === 0) {
  const sessionStores: Array<{ id: string; name: string; currency?: string; taxRate?: number; modules?: string[] }> =
   (user as any).stores ?? []
  fullStores = sessionStores.map(s => ({
   id: s.id,
   name: s.name,
   currency: s.currency ?? 'IDR',
   timezone: 'Asia/Jakarta',
   taxRate: s.taxRate ?? 0,
   modules: s.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  }))
 }

 const firstStore = fullStores[0]
 const modules = firstStore?.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

 return (
  <DashboardShell
   userName={user.name ?? 'User'}
   userEmail={user.email}
   userImage={user.image ?? null}
   userRole={user.role as UserRole}
   isSuperAdmin={user.isSuperAdmin ?? false}
   stores={fullStores}
   modules={modules}
  >
   {children}
  </DashboardShell>
 )
}
