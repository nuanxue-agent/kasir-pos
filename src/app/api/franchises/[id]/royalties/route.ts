import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureFranchiseTables } from '../../route'
import { isValidRoyaltyTransition } from '@/lib/franchise'

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

  await ensureFranchiseTables()

  const franchise = await queryOne(`SELECT * FROM Franchise WHERE id = ?`, [id]) as any
  if (!franchise) return err('Franchise not found', 404, 'NOT_FOUND')

  const sp = req.nextUrl.searchParams
  const status = sp.get('status')
  let sql = `SELECT * FROM FranchiseRoyalty WHERE franchiseId = ?`
  const args: any[] = [id]
  if (status) { sql += ` AND status = ?`; args.push(status) }
  sql += ` ORDER BY period DESC`

  const rows = await query(sql, args)
  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureFranchiseTables()

  const franchise = await queryOne(`SELECT * FROM Franchise WHERE id = ?`, [id]) as any
  if (!franchise) return err('Franchise not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  // Allow manual royalty creation or status update
  if (b.royaltyId && b.status) {
    // Status transition on existing royalty
    const royalty = await queryOne(`SELECT * FROM FranchiseRoyalty WHERE id = ?`, [b.royaltyId]) as any
    if (!royalty) return err('Royalty not found', 404, 'NOT_FOUND')
    if (!isValidRoyaltyTransition(royalty.status, b.status))
      return err(`Cannot transition from ${royalty.status} to ${b.status}`, 400, 'INVALID_STATE')

    const paidAt = b.status === 'PAID' ? nowISO() : royalty.paidAt
    await exec(
      `UPDATE FranchiseRoyalty SET status = ?, paidAt = ?, updatedAt = ? WHERE id = ?`,
      [b.status, paidAt, nowISO(), b.royaltyId],
    )
    return NextResponse.json({ ok: true })
  }

  if (!b.period) return err("Field 'period' is required", 400, 'MISSING_FIELD')
  if (!b.amount && b.amount !== 0) return err("Field 'amount' is required", 400, 'MISSING_FIELD')
  if (!b.dueDate) return err("Field 'dueDate' is required", 400, 'MISSING_FIELD')

  // Check for duplicate period
  const existing = await queryOne(
    `SELECT id FROM FranchiseRoyalty WHERE franchiseId = ? AND period = ?`,
    [id, b.period],
  ) as any
  if (existing) return err('Royalty for this period already exists', 409, 'DUPLICATE')

  const t = nowISO()
  const royaltyId = newId()
  await exec(
    `INSERT INTO FranchiseRoyalty (id, franchiseId, storeId, period, amount, status, dueDate, paidAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [royaltyId, id, franchise.franchiseeStoreId, b.period, b.amount, 'PENDING', b.dueDate, null, t, t],
  )
  return NextResponse.json({ id: royaltyId }, { status: 201 })
}
