import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureProductionTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureProductionTables()

  const rows = await query(
    `SELECT pm.*, p.name AS materialName, p.sku, p.stock AS currentStock
     FROM ProductionMaterial pm
     LEFT JOIN Product p ON p.id = pm.materialProductId
     WHERE pm.orderId = ? AND pm.storeId = ?`,
    [id, storeId],
  ).catch(async () =>
    query(`SELECT * FROM ProductionMaterial WHERE orderId = ? AND storeId = ?`, [id, storeId]),
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: orderId } = await params
  const b = (await req.json()) as any
  const storeId = b.storeId ?? req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureProductionTables()

  // Verify order exists
  const orderRows = await query(
    `SELECT * FROM ProductionOrder WHERE id = ? AND storeId = ?`,
    [orderId, storeId],
  ) as any[]
  if (!orderRows.length) return err('Production order not found', 404, 'NOT_FOUND')

  if (!b.materialProductId) return err("'materialProductId' is required", 400, 'MISSING_FIELD')
  const requiredQty = Number(b.requiredQty ?? 0)
  if (requiredQty <= 0) return err("'requiredQty' must be positive", 400, 'INVALID_FIELD')

  const matId = newId()
  await exec(
    `INSERT INTO ProductionMaterial (id, orderId, storeId, materialProductId, requiredQty, usedQty)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [matId, orderId, storeId, b.materialProductId, requiredQty],
  )

  const [created] = await query(`SELECT * FROM ProductionMaterial WHERE id = ?`, [matId]) as any[]
  return NextResponse.json(created, { status: 201 })
}
