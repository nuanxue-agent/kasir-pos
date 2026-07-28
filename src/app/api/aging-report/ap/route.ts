// GET /api/aging-report/ap — Accounts Payable aging report
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { daysOverdue, assignBucket } from '../ar/route'
import { ensureSupplierBillTable } from '../../supplier-bills/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/aging-report/ap?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureSupplierBillTable()

    // Fetch unpaid / partial supplier bills
    const bills = await query<Record<string, unknown>>(
      `SELECT * FROM SupplierBill WHERE storeId = ? AND status NOT IN ('PAID', 'DRAFT') ORDER BY dueDate ASC`,
      [storeId]
    )

    const asOf = new Date()

    // Group by vendor
    const vendorMap: Record<string, {
      id: string; name: string
      current: number; d31_60: number; d61_90: number; d91_120: number; d120plus: number
    }> = {}

    for (const bill of bills) {
      const vendorId = bill.vendorId as string
      // vendorId is used as name fallback — in a real app you'd join to a Vendor table
      const vendorName = (bill.vendorName as string | undefined) ?? vendorId
      const balance = (bill.amount as number) - (bill.paidAmount as number ?? 0)
      if (balance <= 0) continue

      const days = daysOverdue(bill.dueDate as string, asOf)
      const bucket = assignBucket(days)

      if (!vendorMap[vendorId]) {
        vendorMap[vendorId] = { id: vendorId, name: vendorName, current: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120plus: 0 }
      }
      const entry = vendorMap[vendorId]
      if (bucket === 'current') entry.current += balance
      else if (bucket === '31-60') entry.d31_60 += balance
      else if (bucket === '61-90') entry.d61_90 += balance
      else if (bucket === '91-120') entry.d91_120 += balance
      else entry.d120plus += balance
    }

    const rows = Object.values(vendorMap).map(r => ({
      ...r,
      total: r.current + r.d31_60 + r.d61_90 + r.d91_120 + r.d120plus,
    }))

    const summary = rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        d31_60: acc.d31_60 + r.d31_60,
        d61_90: acc.d61_90 + r.d61_90,
        d91_120: acc.d91_120 + r.d91_120,
        d120plus: acc.d120plus + r.d120plus,
        total: acc.total + r.total,
      }),
      { current: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120plus: 0, total: 0 }
    )

    return ok({ rows, summary, asOf: asOf.toISOString() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
