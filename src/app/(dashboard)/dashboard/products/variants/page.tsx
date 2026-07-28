import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { ensureVariantTables } from '@/app/api/product-variants/route'
import VariantMatrixClient from '@/components/products/VariantMatrixClient'

export default async function ProductVariantsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  await ensureVariantTables()

  const [products, attributes, variants] = await Promise.all([
    query(
      `SELECT id, name, price FROM Product WHERE storeId = ? AND active = 1 ORDER BY name`,
      [storeId]
    ),
    query(
      `SELECT * FROM VariantAttribute WHERE storeId = ? ORDER BY createdAt ASC`,
      [storeId]
    ),
    query(
      `SELECT * FROM ProductVariant WHERE storeId = ? ORDER BY createdAt ASC`,
      [storeId]
    ),
  ])

  const parsedAttributes = (attributes as any[]).map(a => ({
    ...a,
    values: JSON.parse(a.values ?? '[]'),
  }))

  const parsedVariants = (variants as any[]).map(v => ({
    ...v,
    attributes: JSON.parse(v.attributes ?? '{}'),
    active: Boolean(v.active),
  }))

  return (
    <VariantMatrixClient
      storeId={storeId}
      currency={currency}
      products={products as any}
      initialAttributes={parsedAttributes}
      initialVariants={parsedVariants}
    />
  )
}
