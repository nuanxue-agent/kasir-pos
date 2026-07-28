// GET /api/kits/[id]/components
// POST /api/kits/[id]/components
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId } from '@/lib/db'
import { ensureKitTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: kitId } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureKitTables()

  const rows = await query(
    `SELECT kc.*, p.name AS componentProductName, p.stock AS currentStock, p.cost AS costPerUnit
     FROM KitComponent kc
     LEFT JOIN Product p ON p.id = kc.componentProductId
     WHERE kc.kitId = ?
     ORDER BY p.name ASC`,
    [kitId],
  )

  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: kitId } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureKitTables()

  // Verify kit exists
  const kitRows = await query(`SELECT id FROM Kit WHERE id = ? AND storeId = ?`, [kitId, storeId])
  if ((kitRows as any[]).length === 0) return err('Kit not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.componentProductId) return err("'componentProductId' is required", 400, 'MISSING_FIELD')

  const requiredQty = Number(b.requiredQty ?? 1)
  if (requiredQty <= 0) return err("'requiredQty' must be positive", 400, 'INVALID_FIELD')

  // Prevent duplicate component in the same kit
  const existing = await query(
    `SELECT id FROM KitComponent WHERE kitId = ? AND componentProductId = ?`,
    [kitId, b.componentProductId],
  )
  if ((existing as any[]).length > 0) {
    return err('Component already exists in this kit', 400, 'DUPLICATE')
  }

  const id = newId()
  await exec(
    `INSERT INTO KitComponent (id, kitId, storeId, componentProductId, requiredQty)
     VALUES (?, ?, ?, ?, ?)`,
    [id, kitId, storeId, b.componentProductId, requiredQty],
  )

  return NextResponse.json({ id }, { status: 201 })
}
