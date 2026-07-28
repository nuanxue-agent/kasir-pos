// GET /api/supplier-invoices?storeId=
// POST /api/supplier-invoices
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS SupplierInvoice (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    vendorId      TEXT NOT NULL,
    invoiceNumber TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    tax           REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    dueDate       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    createdAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS SupplierPayment (
    id            TEXT PRIMARY KEY,
    invoiceId     TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    paymentMethod TEXT NOT NULL DEFAULT 'TRANSFER',
    paidAt        TEXT NOT NULL,
    note          TEXT
  )`)
}

// GET /api/supplier-invoices?storeId=xxx&status=PENDING&vendorId=yyy
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

    await ensureTables()

    const status = url.searchParams.get('status')
    const vendorId = url.searchParams.get('vendorId')

    let sql = `SELECT * FROM SupplierInvoice WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (vendorId) { sql += ` AND vendorId = ?`; params.push(vendorId) }
    sql += ` ORDER BY createdAt DESC`

    const invoices = await query<Record<string, unknown>>(sql, params)

    // Attach paid amounts
    const ids = invoices.map(i => i.id as string)
    let payments: Record<string, unknown>[] = []
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      payments = await query<Record<string, unknown>>(
        `SELECT invoiceId, SUM(amount) as paid FROM SupplierPayment WHERE invoiceId IN (${placeholders}) GROUP BY invoiceId`,
        ids
      )
    }
    const paidMap = Object.fromEntries(payments.map(p => [p.invoiceId as string, p.paid as number]))

    const result = invoices.map(inv => ({
      ...inv,
      paid: paidMap[inv.id as string] ?? 0,
      balance: (inv.total as number) - (paidMap[inv.id as string] ?? 0),
    }))

    return ok(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/supplier-invoices?storeId=xxx
// Body: { vendorId, invoiceNumber, amount, tax?, dueDate }
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

    await ensureTables()

    const body = await req.json() as {
      vendorId?: string
      invoiceNumber?: string
      amount?: number
      tax?: number
      dueDate?: string
    }

    if (!body.vendorId?.trim()) return err('vendorId required')
    if (!body.invoiceNumber?.trim()) return err('invoiceNumber required')
    if (!body.amount || body.amount <= 0) return err('amount must be positive')
    if (!body.dueDate) return err('dueDate required')

    const amount = Number(body.amount)
    const tax = Number(body.tax ?? 0)
    const total = amount + tax
    const now = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO SupplierInvoice (id, storeId, vendorId, invoiceNumber, amount, tax, total, dueDate, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, storeId, body.vendorId.trim(), body.invoiceNumber.trim(), amount, tax, total, body.dueDate, now]
    )

    return ok({ id, storeId, vendorId: body.vendorId, invoiceNumber: body.invoiceNumber, amount, tax, total, dueDate: body.dueDate, status: 'PENDING', createdAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
