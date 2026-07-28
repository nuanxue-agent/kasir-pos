// GET /api/aging-report/ar — Accounts Receivable aging report
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureInvoiceTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Invoice (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    customerId TEXT NOT NULL,
    customerName TEXT NOT NULL,
    invoiceNumber TEXT NOT NULL,
    issueDate TEXT NOT NULL,
    dueDate TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS InvoicePayment (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    paidAt TEXT NOT NULL
  )`)
}

export function daysOverdue(dueDateISO: string, asOf: Date = new Date()): number {
  const due = new Date(dueDateISO)
  due.setHours(0, 0, 0, 0)
  const ref = new Date(asOf)
  ref.setHours(0, 0, 0, 0)
  return Math.floor((ref.getTime() - due.getTime()) / 86_400_000)
}

export function assignBucket(days: number): 'current' | '31-60' | '61-90' | '91-120' | '120+' {
  if (days <= 30) return 'current'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  if (days <= 120) return '91-120'
  return '120+'
}

// GET /api/aging-report/ar?storeId=xxx
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

    await ensureInvoiceTables()

    // Fetch unpaid / partial invoices
    const invoices = await query<Record<string, unknown>>(
      `SELECT * FROM Invoice WHERE storeId = ? AND status NOT IN ('PAID', 'VOID', 'DRAFT') ORDER BY dueDate ASC`,
      [storeId]
    )

    // Fetch paid amounts
    const ids = invoices.map(i => i.id as string)
    let paidMap: Record<string, number> = {}
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      const payments = await query<Record<string, unknown>>(
        `SELECT invoiceId, SUM(amount) as paid FROM InvoicePayment WHERE invoiceId IN (${placeholders}) GROUP BY invoiceId`,
        ids
      )
      paidMap = Object.fromEntries(payments.map(p => [p.invoiceId as string, p.paid as number]))
    }

    const asOf = new Date()

    // Group by customer
    const customerMap: Record<string, {
      id: string; name: string
      current: number; d31_60: number; d61_90: number; d91_120: number; d120plus: number
    }> = {}

    for (const inv of invoices) {
      const customerId = inv.customerId as string
      const customerName = inv.customerName as string
      const balance = (inv.total as number) - (paidMap[inv.id as string] ?? 0)
      if (balance <= 0) continue

      const days = daysOverdue(inv.dueDate as string, asOf)
      const bucket = assignBucket(days)

      if (!customerMap[customerId]) {
        customerMap[customerId] = { id: customerId, name: customerName, current: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120plus: 0 }
      }
      const entry = customerMap[customerId]
      if (bucket === 'current') entry.current += balance
      else if (bucket === '31-60') entry.d31_60 += balance
      else if (bucket === '61-90') entry.d61_90 += balance
      else if (bucket === '91-120') entry.d91_120 += balance
      else entry.d120plus += balance
    }

    const rows = Object.values(customerMap).map(r => ({
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
