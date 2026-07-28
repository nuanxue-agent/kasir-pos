import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import BarcodeScannerClient from '@/components/products/BarcodeScannerClient'

export const metadata = { title: 'Barcode Scanner & Label' }

export default async function BarcodePage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const storeName = user.stores?.[0]?.name ?? ''

  const products = await query(
    `SELECT p.id, p.name, p.price, p.cost, p.stock, p.trackStock, p.sku, p.barcode, p.image,
            c.id as catId, c.name as catName, c.color as catColor
     FROM Product p
     LEFT JOIN Category c ON p.categoryId = c.id
     WHERE p.storeId = ? AND p.active = 1
     ORDER BY p.name`,
    [storeId],
  )

  const enriched = (products as any[]).map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    cost: r.cost,
    stock: r.stock,
    trackStock: Boolean(r.trackStock),
    sku: r.sku,
    barcode: r.barcode,
    image: r.image,
    category: r.catId ? { id: r.catId, name: r.catName, color: r.catColor } : null,
  }))

  return (
    <BarcodeScannerClient
      storeId={storeId}
      currency={currency}
      storeName={storeName}
      initialProducts={enriched}
    />
  )
}
