import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import SupplierContractClient from '@/components/inventory/SupplierContractClient'

export const metadata = { title: 'Supplier Contracts — Inventory' }

export default async function SupplierContractsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS SupplierContract (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    vendorId       TEXT NOT NULL,
    contractNumber TEXT NOT NULL,
    startDate      TEXT NOT NULL,
    endDate        TEXT NOT NULL,
    paymentTerms   TEXT NOT NULL DEFAULT 'NET30',
    status         TEXT NOT NULL DEFAULT 'DRAFT',
    notes          TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ContractPriceLine (
    id           TEXT PRIMARY KEY,
    contractId   TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    unitPrice    REAL NOT NULL DEFAULT 0,
    minOrderQty  REAL NOT NULL DEFAULT 1,
    validFrom    TEXT NOT NULL,
    validTo      TEXT NOT NULL,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)

  const [contractsRaw, vendors, products] = await Promise.all([
    query(
      `SELECT sc.*, v.name as vendorName
       FROM SupplierContract sc
       LEFT JOIN Vendor v ON sc.vendorId = v.id
       WHERE sc.storeId = ?
       ORDER BY sc.createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`,
      [storeId],
    ).catch(() => []),
    query(
      `SELECT id, name, price FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ).catch(() => []),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SupplierContractClient
        storeId={storeId}
        currency={currency}
        initialContracts={contractsRaw as any[]}
        vendors={vendors as any[]}
        products={products as any[]}
      />
    </main>
  )
}
