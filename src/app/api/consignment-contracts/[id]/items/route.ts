import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureConsignmentTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureConsignmentTables()

  const contract = (await queryOne(
    `SELECT id FROM ConsignmentContract WHERE id = ?`,
    [id],
  )) as any
  if (!contract) return err('Contract not found', 404, 'NOT_FOUND')

  const rows = await query(
    `SELECT ci.*, p.name as productName
     FROM ConsignmentItem ci
     LEFT JOIN Product p ON ci.productId = p.id
     WHERE ci.contractId = ?
     ORDER BY ci.createdAt ASC`,
    [id],
  ).catch(() => [])

  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureConsignmentTables()

  const contract = (await queryOne(
    `SELECT * FROM ConsignmentContract WHERE id = ?`,
    [id],
  )) as any
  if (!contract) return err('Contract not found', 404, 'NOT_FOUND')
  if (contract.status !== 'ACTIVE') {
    return err('Cannot add items to a terminated contract', 409, 'INVALID_STATE')
  }

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id ?? contract.storeId
  const b = (await req.json()) as any

  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.qty === undefined) return err("Field 'qty' is required", 400, 'MISSING_FIELD')
  if (b.costPrice === undefined) return err("Field 'costPrice' is required", 400, 'MISSING_FIELD')

  const qty = Number(b.qty)
  const costPrice = Number(b.costPrice)
  if (isNaN(qty) || qty <= 0) return err('qty must be a positive number', 400, 'INVALID_FIELD')
  if (isNaN(costPrice) || costPrice < 0) return err('costPrice must be >= 0', 400, 'INVALID_FIELD')

  const t = nowISO()
  const itemId = newId()
  await exec(
    `INSERT INTO ConsignmentItem
       (id, contractId, storeId, productId, qty, costPrice, soldQty, settledQty, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [itemId, id, storeId, b.productId, qty, costPrice, t, t],
  )
  return NextResponse.json({ id: itemId }, { status: 201 })
}
