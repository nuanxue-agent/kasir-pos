import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureConsignmentTables } from '../../route'
import { calcTotalCost, calcCommission, periodLabel } from '@/lib/consignment'
import type { SettlementPeriod } from '@/lib/consignment'

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
  const user = session.user as any

  await ensureConsignmentTables()

  const contract = (await queryOne(
    `SELECT * FROM ConsignmentContract WHERE id = ?`,
    [id],
  )) as any
  if (!contract) return err('Contract not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id ?? contract.storeId

  // Determine settlement period label — caller can pass explicit period or we derive from today
  const forDate = b.forDate ? new Date(b.forDate) : new Date()
  const period = b.period ?? periodLabel(forDate, contract.settlementPeriod as SettlementPeriod)

  // Check for duplicate settlement
  const existing = (await queryOne(
    `SELECT id FROM ConsignmentSettlement WHERE contractId = ? AND period = ?`,
    [id, period],
  )) as any
  if (existing) return err(`Settlement for period ${period} already exists`, 409, 'DUPLICATE')

  // Gather unsettled items for this contract
  const items = (await query(
    `SELECT * FROM ConsignmentItem WHERE contractId = ? AND storeId = ? AND soldQty > settledQty`,
    [id, storeId],
  )) as any[]

  if (items.length === 0) {
    return err('No unsettled sales found for this period', 400, 'NOTHING_TO_SETTLE')
  }

  // Aggregate totals
  let totalSoldQty = 0
  let totalCost = 0
  for (const item of items) {
    const unsettled = item.soldQty - item.settledQty
    totalSoldQty += unsettled
    totalCost += calcTotalCost(unsettled, item.costPrice)
  }

  const commissionAmount = calcCommission(totalCost, contract.commissionRate)
  const t = nowISO()
  const settlementId = newId()

  // Insert settlement record
  await exec(
    `INSERT INTO ConsignmentSettlement
       (id, contractId, storeId, period, soldQty, totalCost, commissionAmount, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [settlementId, id, storeId, period, totalSoldQty, totalCost, commissionAmount, t, t],
  )

  // Mark items as settled
  for (const item of items) {
    await exec(
      `UPDATE ConsignmentItem SET settledQty = soldQty, updatedAt = ? WHERE id = ?`,
      [t, item.id],
    )
  }

  return NextResponse.json(
    {
      id: settlementId,
      period,
      soldQty: totalSoldQty,
      totalCost,
      commissionAmount,
      vendorPayment: Math.round((totalCost - commissionAmount) * 100) / 100,
      status: 'PENDING',
    },
    { status: 201 },
  )
}
