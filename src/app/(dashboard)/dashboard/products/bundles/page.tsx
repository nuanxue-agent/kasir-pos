import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import BundlesPageClient from '@/components/products/BundlesPageClient'
import { ensureBundleTables } from '@/app/api/bundles/route'

export default async function BundlesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  await ensureBundleTables()

  const [bundleRows, products] = await Promise.all([
    query(
      `SELECT b.*,
              GROUP_CONCAT(bi.id || ':' || bi.productId || ':' || bi.qty || ':' || bi.unitPrice) AS itemsRaw
       FROM ProductBundle b
       LEFT JOIN BundleItem bi ON bi.bundleId = b.id
       WHERE b.storeId = ?
       GROUP BY b.id
       ORDER BY b.name`,
      [storeId],
    ),
    query(
      `SELECT id, name, price, stock, trackStock FROM Product WHERE storeId = ? AND active = 1 ORDER BY name`,
      [storeId],
    ),
  ])

  const productMap = Object.fromEntries((products as any[]).map(p => [p.id, p]))
  const bundles = (bundleRows as any[]).map(row => {
    const items = row.itemsRaw
      ? row.itemsRaw.split(',').map((s: string) => {
          const [id, productId, qty, unitPrice] = s.split(':')
          return {
            id,
            productId,
            qty: Number(qty),
            unitPrice: Number(unitPrice),
            product: productMap[productId] ?? null,
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return {
      ...rest,
      bundlePrice: Number(rest.bundlePrice ?? rest.price ?? 0),
      discountType: rest.discountType ?? 'FIXED',
      discountValue: Number(rest.discountValue ?? 0),
      active: Boolean(rest.active),
      items,
    }
  })

  return (
    <BundlesPageClient
      storeId={storeId}
      currency={currency}
      initialBundles={bundles as any}
      products={products as any}
    />
  )
}
