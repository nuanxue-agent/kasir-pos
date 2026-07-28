import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { generateInvoiceNumber } from '@/lib/invoices'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureInvoiceTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Invoice (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    customerId   TEXT NOT NULL,
    invoiceNumber TEXT NOT NULL,
    issueDate    TEXT NOT NULL,
    dueDate      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    subtotal     REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    paymentTerms TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS InvoiceItem (
    id          TEXT PRIMARY KEY,
    invoiceId   TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    description TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 1,
    unitPrice   REAL NOT NULL DEFAULT 0,
    total       REAL NOT NULL DEFAULT 0
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS InvoicePayment (
    id            TEXT PRIMARY KEY,
    invoiceId     TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    paymentMethod TEXT NOT NULL DEFAULT 'TRANSFER',
    paidAt        TEXT NOT NULL,
    note          TEXT
  )`)
}

// GET /api/invoices?storeId=&status=&customerId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = req.nextUrl
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureInvoiceTables()

    const status     = url.searchParams.get('status')
    const customerId = url.searchParams.get('customerId')

    let sql = `SELECT * FROM Invoice WHERE storeId = ?`
    const params: unknown[] = [storeId]
    if (status)     { sql += ` AND status = ?`;     params.push(status) }
    if (customerId) { sql += ` AND customerId = ?`; params.push(customerId) }
    sql += ` ORDER BY createdAt DESC`

    const invoices = await query(sql, params)
    return ok(invoices)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/invoices?storeId=
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureInvoiceTables()

    const b = (await req.json()) as any
    if (!b.customerId)  return err('customerId is required')
    if (!b.issueDate)   return err('issueDate is required')
    if (!b.dueDate)     return err('dueDate is required')

    // Auto-generate invoice number
    const year = new Date().getUTCFullYear()
    const lastRows = await query(
      `SELECT invoiceNumber FROM Invoice WHERE storeId = ? AND invoiceNumber LIKE ? ORDER BY invoiceNumber DESC LIMIT 1`,
      [storeId, `INV-${year}-%`]
    ) as any[]
    let seq = 1
    if (lastRows.length > 0) {
      const last = lastRows[0].invoiceNumber as string
      const m = last.match(/INV-\d{4}-(\d+)/)
      if (m) seq = parseInt(m[1], 10) + 1
    }
    const invoiceNumber = b.invoiceNumber || generateInvoiceNumber(year, seq)

    const subtotal    = Number(b.subtotal ?? 0)
    const taxAmount   = Number(b.taxAmount ?? 0)
    const total       = Number(b.total ?? subtotal + taxAmount)
    const t           = nowISO()
    const id          = newId()

    await exec(
      `INSERT INTO Invoice (id, storeId, customerId, invoiceNumber, issueDate, dueDate, status, subtotal, taxAmount, total, notes, paymentTerms, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.customerId, invoiceNumber, b.issueDate, b.dueDate,
       b.status ?? 'DRAFT', subtotal, taxAmount, total,
       b.notes ?? null, b.paymentTerms ?? null, t, t]
    )

    // Insert items if provided
    if (Array.isArray(b.items)) {
      for (const item of b.items) {
        const itemId    = newId()
        const itemTotal = Math.round(Number(item.qty ?? 1) * Number(item.unitPrice ?? 0) * 100) / 100
        await exec(
          `INSERT INTO InvoiceItem (id, invoiceId, storeId, description, qty, unitPrice, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [itemId, id, storeId, item.description, Number(item.qty ?? 1), Number(item.unitPrice ?? 0), itemTotal]
        )
      }
    }

    const created = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    return ok(created[0], 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
