import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureFranchiseTables } from '../../route'
import { calcRoyaltyAmount, getBillingPeriod } from '@/lib/franchise'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
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
  if (franchise.status !== 'ACTIVE') return err('Franchise is not active', 400, 'INVALID_STATE')

  const b = (await req.json()) as any
  // period can be supplied or auto-derived from current date
  const refDate = b.date ? new Date(b.date) : new Date()
  const { period, dueDate } = getBillingPeriod(refDate, franchise.billingCycle as any)

  // Check for existing royalty for this period
  const existing = await queryOne(
    `SELECT id, amount FROM FranchiseRoyalty WHERE franchiseId = ? AND period = ?`,
    [id, period],
  ) as any

  // Calculate royalty from sales in the franchisee's store for this period
  // Pull actual revenue from Orders table (best-effort; fall back to b.totalSales if provided)
  let totalSales: number = b.totalSales ?? 0

  if (!b.totalSales) {
    const salesRows = await query(
      `SELECT COALESCE(SUM(total), 0) as totalSales
       FROM Orders
       WHERE storeId = ? AND status = 'completed'
         AND strftime('%Y-%m', createdAt) = ?`,
      [franchise.franchiseeStoreId, period.length === 7 ? period : period.slice(0, 7)],
    ).catch(() => [{ totalSales: 0 }])
    totalSales = (salesRows[0] as any)?.totalSales ?? 0
  }

  const amount = calcRoyaltyAmount(totalSales, franchise.royaltyType, franchise.royaltyRate)

  if (existing) {
    // Update the existing royalty amount (re-calculation)
    await exec(
      `UPDATE FranchiseRoyalty SET amount = ?, updatedAt = ? WHERE id = ?`,
      [amount, nowISO(), existing.id],
    )
    return NextResponse.json({ id: existing.id, period, amount, recalculated: true })
  }

  const t = nowISO()
  const royaltyId = newId()
  await exec(
    `INSERT INTO FranchiseRoyalty (id, franchiseId, storeId, period, amount, status, dueDate, paidAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [royaltyId, id, franchise.franchiseeStoreId, period, amount, 'PENDING', dueDate, null, t, t],
  )
  return NextResponse.json({ id: royaltyId, period, amount, dueDate }, { status: 201 })
}
