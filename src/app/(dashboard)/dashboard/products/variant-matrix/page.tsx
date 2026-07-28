import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import VariantMatrixClient from '@/components/products/VariantMatrixClient'

export const metadata = { title: 'Matriks Varian — Produk' }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductAttribute (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    name      TEXT NOT NULL,
    values    TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ProductVariant (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    productId  TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    sku        TEXT,
    price      REAL NOT NULL DEFAULT 0,
    stock      INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
}

export default async function VariantMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const { productId } = await searchParams

  await ensureTables()

  // Load products for selector
  const productsRaw = await query(
    `SELECT id, name FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
    [storeId],
  )
  const products = productsRaw as any[]

  // If no productId selected, redirect to first product or show empty state
  const activeProductId = productId ?? products[0]?.id ?? ''
  const activeProduct = products.find(p => p.id === activeProductId)

  let attributes: any[] = []
  let variants: any[] = []

  if (activeProductId) {
    const [attrsRaw, variantsRaw] = await Promise.all([
      query(
        `SELECT * FROM ProductAttribute WHERE storeId = ? AND productId = ? ORDER BY name`,
        [storeId, activeProductId],
      ),
      query(
        `SELECT * FROM ProductVariant WHERE storeId = ? AND productId = ? AND active = 1 ORDER BY sku`,
        [storeId, activeProductId],
      ),
    ])

    attributes = (attrsRaw as any[]).map(r => ({
      ...r,
      values: JSON.parse(r.values ?? '[]'),
    }))

    variants = (variantsRaw as any[]).map(r => ({
      ...r,
      attributes: JSON.parse(r.attributes ?? '{}'),
      active: Boolean(r.active),
    }))
  }

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Product selector */}
      {products.length > 1 && (
        <form method="get" className="flex items-center gap-3">
          <label className="text-sm font-medium text-stone-600">Produk:</label>
          <select
            name="productId"
            defaultValue={activeProductId}
            onChange={e => {
              // Client-side navigation — form submit handles it
            }}
            className="text-sm px-3 py-1.5 rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded-xl bg-stone-800 text-white hover:bg-stone-700 transition-colors"
          >
            Pilih
          </button>
        </form>
      )}

      {activeProductId && activeProduct ? (
        <VariantMatrixClient
          storeId={storeId}
          currency={currency}
          productId={activeProductId}
          productName={activeProduct.name}
          initialAttributes={attributes}
          initialVariants={variants}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-64 rounded-2xl border-2 border-dashed border-stone-200 text-stone-400">
          <p className="text-sm">Belum ada produk. Tambahkan produk terlebih dahulu.</p>
        </div>
      )}
    </main>
  )
}
