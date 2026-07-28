import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { ensureLabelTables } from '@/app/api/label-templates/route'
import LabelPrintClient from '@/components/products/LabelPrintClient'

export const metadata = { title: 'Label & Barcode Print — Products' }

export default async function LabelPrintPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureLabelTables()

  const [templatesRaw, productsRaw] = await Promise.all([
    query(`SELECT * FROM LabelTemplate WHERE storeId = ? ORDER BY createdAt DESC`, [storeId]),
    query(
      `SELECT id, name, price, sku FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const templates = (templatesRaw as any[]).map(row => ({
    ...row,
    active: Boolean(row.active),
    fields: JSON.parse(row.fields || '[]'),
  }))

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <LabelPrintClient
        storeId={storeId}
        currency={currency}
        products={productsRaw as any[]}
        initialTemplates={templates}
      />
    </main>
  )
}
