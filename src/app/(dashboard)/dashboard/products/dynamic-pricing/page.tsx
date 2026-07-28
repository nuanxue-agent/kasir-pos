import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import DynamicPricingClient from '@/components/products/DynamicPricingClient'

export const metadata = { title: 'Dynamic Pricing — Products' }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PricingRule (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'TIME_BASED',
    condition TEXT NOT NULL DEFAULT '{}',
    action    TEXT NOT NULL DEFAULT '{}',
    priority  INTEGER NOT NULL DEFAULT 10,
    active    INTEGER NOT NULL DEFAULT 1,
    validFrom TEXT,
    validTo   TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PriceAdjustmentLog (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    ruleId    TEXT NOT NULL,
    oldPrice  REAL NOT NULL,
    newPrice  REAL NOT NULL,
    appliedAt TEXT NOT NULL,
    reason    TEXT NOT NULL DEFAULT ''
  )`)
}

export default async function DynamicPricingPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureTables()

  const [rulesRaw, productsRaw] = await Promise.all([
    query(
      `SELECT * FROM PricingRule WHERE storeId = ? ORDER BY priority DESC, createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, price, stock FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ),
  ])

  const rules = (rulesRaw as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    condition: (() => { try { return JSON.parse(r.condition || '{}') } catch { return {} } })(),
    action: (() => { try { return JSON.parse(r.action || '{}') } catch { return {} } })(),
  }))
  const products = productsRaw as any[]
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DynamicPricingClient
        storeId={storeId}
        currency={currency}
        initialRules={rules}
        products={products}
      />
    </main>
  )
}
