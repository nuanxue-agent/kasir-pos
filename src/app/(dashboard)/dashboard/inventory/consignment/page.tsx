import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { ensureConsignmentTables } from '@/app/api/consignment-contracts/route'
import ConsignmentClient from '@/components/inventory/ConsignmentClient'

export const metadata = { title: 'Konsinyasi — Inventori' }

export default async function ConsignmentPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  await ensureConsignmentTables()

  const [contracts, vendors, products] = await Promise.all([
    query(
      `SELECT cc.*, v.name as vendorName
       FROM ConsignmentContract cc
       LEFT JOIN Vendor v ON cc.vendorId = v.id
       WHERE cc.storeId = ?
       ORDER BY cc.createdAt DESC`,
      [storeId],
    ).catch(() => []),
    query(`SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`, [storeId]).catch(() => []),
    query(`SELECT id, name, price FROM Product WHERE storeId = ? ORDER BY name ASC`, [storeId]).catch(() => []),
  ])

  return (
    <ConsignmentClient
      storeId={storeId}
      currency={currency}
      initialContracts={contracts as any}
      vendors={vendors as any}
      products={products as any}
    />
  )
}
