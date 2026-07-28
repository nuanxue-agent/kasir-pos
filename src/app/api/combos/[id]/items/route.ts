// GET  /api/combos/[id]/items?storeId=
// POST /api/combos/[id]/items?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureCombTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: comboId } = await params
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const items = (await query(
    `SELECT ci.*, p.name as productName, p.price as productPrice, p.cost as productCost
     FROM ComboItem ci
     LEFT JOIN Product p ON p.id = ci.productId
     WHERE ci.comboId = ? AND ci.storeId = ?
     ORDER BY ci.createdAt ASC`,
    [comboId, storeId],
  )) as any[]

  return NextResponse.json(
    items.map(r => ({ ...r, isOptional: Boolean(r.isOptional) })),
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: comboId } = await params
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const combo = await queryOne(`SELECT id FROM Combo WHERE id = ? AND storeId = ?`, [comboId, storeId]) as any
  if (!combo) return err('Combo not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')

  const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [b.productId, storeId]) as any
  if (!product) return err('Product not found', 404, 'NOT_FOUND')

  const id = newId()
  const t = nowISO()

  await exec(
    `INSERT INTO ComboItem (id, comboId, storeId, productId, qty, isOptional, substituteGroupId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, comboId, storeId,
      b.productId,
      Number(b.qty ?? 1),
      b.isOptional ? 1 : 0,
      b.substituteGroupId ?? null,
      t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
