// GET /api/supplier-invoices/aging?storeId=xxx
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

export function getAgingBucket(dueDate: string, today: string): AgingBucket {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return '0-30' // not yet overdue
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

// GET /api/supplier-invoices/aging?storeId=xxx
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

    const today = new Date().toISOString().slice(0, 10)

    // Only unpaid / partially paid invoices that are past due date
    const invoices = await query<{
      id: string
      vendorId: string
      invoiceNumber: string
      total: number
      dueDate: string
      status: string
    }>(
      `SELECT id, vendorId, invoiceNumber, total, dueDate, status
       FROM SupplierInvoice
       WHERE storeId = ? AND status IN ('PENDING','PARTIAL','OVERDUE')
         AND dueDate < ?
       ORDER BY dueDate ASC`,
      [storeId, today]
    )

    // Attach paid amounts
    const ids = invoices.map(i => i.id)
    let paidMap: Record<string, number> = {}
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      const rows = await query<{ invoiceId: string; paid: number }>(
        `SELECT invoiceId, SUM(amount) as paid FROM SupplierPayment WHERE invoiceId IN (${placeholders}) GROUP BY invoiceId`,
        ids
      )
      paidMap = Object.fromEntries(rows.map(r => [r.invoiceId, r.paid]))
    }

    const buckets: Record<AgingBucket, { count: number; totalBalance: number; invoices: unknown[] }> = {
      '0-30':  { count: 0, totalBalance: 0, invoices: [] },
      '31-60': { count: 0, totalBalance: 0, invoices: [] },
      '61-90': { count: 0, totalBalance: 0, invoices: [] },
      '90+':   { count: 0, totalBalance: 0, invoices: [] },
    }

    for (const inv of invoices) {
      const bucket = getAgingBucket(inv.dueDate, today)
      const paid = paidMap[inv.id] ?? 0
      const balance = inv.total - paid
      buckets[bucket].count++
      buckets[bucket].totalBalance += balance
      buckets[bucket].invoices.push({ ...inv, paid, balance })
    }

    const totalOverdue = Object.values(buckets).reduce((s, b) => s + b.totalBalance, 0)
    const totalCount = Object.values(buckets).reduce((s, b) => s + b.count, 0)

    return ok({ buckets, totalOverdue, totalCount, asOf: today })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
