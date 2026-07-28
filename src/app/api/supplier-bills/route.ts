// GET/POST /api/supplier-bills
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type BillStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'

export async function ensureSupplierBillTable() {
  await exec(`CREATE TABLE IF NOT EXISTS SupplierBill (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    vendorId TEXT NOT NULL,
    billNumber TEXT NOT NULL,
    issueDate TEXT NOT NULL,
    dueDate TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    paidAmount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL
  )`)
}

// GET /api/supplier-bills?storeId=xxx&status=PENDING&vendorId=yyy
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

    const status = url.searchParams.get('status')
    const vendorId = url.searchParams.get('vendorId')

    let sql = `SELECT * FROM SupplierBill WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (vendorId) { sql += ` AND vendorId = ?`; params.push(vendorId) }
    sql += ` ORDER BY createdAt DESC`

    const bills = await query<Record<string, unknown>>(sql, params)
    return ok(bills)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/supplier-bills?storeId=xxx
// Body: { vendorId, billNumber, issueDate, dueDate, amount }
export async function POST(req: NextRequest) {
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

    const body = await req.json() as {
      vendorId?: string
      billNumber?: string
      issueDate?: string
      dueDate?: string
      amount?: number
    }

    if (!body.vendorId?.trim()) return err('vendorId required')
    if (!body.billNumber?.trim()) return err('billNumber required')
    if (!body.issueDate) return err('issueDate required')
    if (!body.dueDate) return err('dueDate required')
    if (!body.amount || body.amount <= 0) return err('amount must be positive')

    const id = newId()
    const now = nowISO()
    const amount = Number(body.amount)

    await exec(
      `INSERT INTO SupplierBill (id, storeId, vendorId, billNumber, issueDate, dueDate, amount, paidAmount, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?)`,
      [id, storeId, body.vendorId.trim(), body.billNumber.trim(), body.issueDate, body.dueDate, amount, now]
    )

    return ok({ id, storeId, vendorId: body.vendorId.trim(), billNumber: body.billNumber.trim(), issueDate: body.issueDate, dueDate: body.dueDate, amount, paidAmount: 0, status: 'PENDING', createdAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
