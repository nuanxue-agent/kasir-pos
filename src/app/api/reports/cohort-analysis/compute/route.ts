import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureCohortTable } from '../route'
import { toCohortMonth, periodOffset, calcRetentionRate } from '@/lib/cohort-analysis'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureCohortTable()

  // Pull all completed orders with customer info
  const orders = await query(
    `SELECT o.customerId, o.createdAt,
            COALESCE(SUM(oi.price * oi.qty), o.total, 0) as revenue
     FROM Orders o
     LEFT JOIN OrderItem oi ON oi.orderId = o.id
     WHERE o.storeId = ? AND o.status IN ('completed','paid','done')
       AND o.customerId IS NOT NULL AND o.customerId != ''
     GROUP BY o.id, o.customerId, o.createdAt
     ORDER BY o.createdAt ASC`,
    [storeId],
  ).catch(() => [] as any[])

  if ((orders as any[]).length === 0) {
    return NextResponse.json({ computed: 0, message: 'No order data found' })
  }

  // Find acquisition month per customer
  const firstOrderMonth: Record<string, string> = {}
  for (const o of orders as any[]) {
    const month = toCohortMonth(o.createdAt)
    if (!firstOrderMonth[o.customerId] || month < firstOrderMonth[o.customerId]) {
      firstOrderMonth[o.customerId] = month
    }
  }

  // Aggregate by (cohortMonth, periodOffset)
  type Cell = { customers: Set<string>; retained: Set<string>; revenue: number }
  const cellMap: Record<string, Record<number, Cell>> = {}

  // Seed cohort-size buckets
  for (const [customerId, cohortMonth] of Object.entries(firstOrderMonth)) {
    if (!cellMap[cohortMonth]) cellMap[cohortMonth] = {}
    if (!cellMap[cohortMonth][0]) {
      cellMap[cohortMonth][0] = { customers: new Set(), retained: new Set(), revenue: 0 }
    }
    cellMap[cohortMonth][0].customers.add(customerId)
  }

  for (const o of orders as any[]) {
    const cohortMonth = firstOrderMonth[o.customerId]
    const activeMonth = toCohortMonth(o.createdAt)
    const offset = periodOffset(cohortMonth, activeMonth)
    if (offset < 0) continue

    if (!cellMap[cohortMonth]) cellMap[cohortMonth] = {}
    if (!cellMap[cohortMonth][offset]) {
      cellMap[cohortMonth][offset] = { customers: new Set(), retained: new Set(), revenue: 0 }
    }
    cellMap[cohortMonth][offset].retained.add(o.customerId)
    cellMap[cohortMonth][offset].revenue += Number(o.revenue ?? 0)
  }

  const now = nowISO()
  let computed = 0

  for (const [cohortMonth, offsets] of Object.entries(cellMap)) {
    const cohortSize = offsets[0]?.customers.size ?? 0
    for (const [offsetStr, cell] of Object.entries(offsets)) {
      const offset = Number(offsetStr)
      const retained = cell.retained.size
      const retentionRate = calcRetentionRate(retained, cohortSize)

      await exec(
        `INSERT OR REPLACE INTO CohortData
           (id, storeId, cohortMonth, periodOffset, customers, retained, retentionRate, revenue, computedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), storeId, cohortMonth, offset, cohortSize, retained, retentionRate, cell.revenue, now],
      )
      computed++
    }
  }

  return NextResponse.json({ computed, cohorts: Object.keys(cellMap).length })
}
