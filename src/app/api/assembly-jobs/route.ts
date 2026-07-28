// GET /api/assembly-jobs?storeId=&status=&kitId=
// POST /api/assembly-jobs?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { checkFeasibility } from '@/lib/kitting'
import type { ComponentWithStock } from '@/lib/kitting'
import { ensureKitTables } from '../kits/route'
export { ensureKitTables } from '../kits/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureKitTables()

  const statusFilter = req.nextUrl.searchParams.get('status')
  const kitIdFilter  = req.nextUrl.searchParams.get('kitId')

  const conditions: string[] = ['aj.storeId = ?']
  const params: any[] = [storeId]

  if (statusFilter) { conditions.push('aj.status = ?'); params.push(statusFilter) }
  if (kitIdFilter)  { conditions.push('aj.kitId = ?');  params.push(kitIdFilter) }

  const rows = await query(
    `SELECT aj.*, k.name AS kitName, k.outputProductId, k.outputQty,
            p.name AS outputProductName
     FROM AssemblyJob aj
     LEFT JOIN Kit k ON k.id = aj.kitId
     LEFT JOIN Product p ON p.id = k.outputProductId
     WHERE ${conditions.join(' AND ')}
     ORDER BY aj.createdAt DESC`,
    params,
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureKitTables()

  const b = (await req.json()) as any
  if (!b.kitId)    return err("'kitId' is required", 400, 'MISSING_FIELD')

  const targetQty = Number(b.targetQty ?? 1)
  if (targetQty <= 0) return err("'targetQty' must be positive", 400, 'INVALID_FIELD')

  // Verify kit belongs to store
  const kitRows = await query(`SELECT * FROM Kit WHERE id = ? AND storeId = ?`, [b.kitId, storeId])
  const kit = (kitRows as any[])[0]
  if (!kit) return err('Kit not found', 404, 'NOT_FOUND')

  // Feasibility check before creating the job
  const compRows = await query(
    `SELECT kc.*, p.stock AS currentStock, p.cost AS costPerUnit
     FROM KitComponent kc
     LEFT JOIN Product p ON p.id = kc.componentProductId
     WHERE kc.kitId = ?`,
    [b.kitId],
  )
  const components = (compRows as any[]).map(r => ({
    ...r,
    requiredQty: Number(r.requiredQty),
    currentStock: Number(r.currentStock ?? 0),
    costPerUnit: Number(r.costPerUnit ?? 0),
  })) as ComponentWithStock[]

  const feasibility = checkFeasibility(components, targetQty)
  if (!feasibility.feasible) {
    return NextResponse.json(
      {
        error: 'Insufficient stock to assemble requested quantity',
        code: 'INSUFFICIENT_STOCK',
        shortfalls: feasibility.shortfalls,
        maxAssemblable: feasibility.maxAssemblable,
      },
      { status: 422 },
    )
  }

  const t  = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO AssemblyJob (id, kitId, storeId, targetQty, status, startedAt, completedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?)`,
    [id, b.kitId, storeId, targetQty, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
