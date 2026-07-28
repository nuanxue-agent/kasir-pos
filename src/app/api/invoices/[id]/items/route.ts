import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId } from '@/lib/db'
import { ensureInvoiceTables } from '../../route'
import { calcItemTotal } from '@/lib/invoices'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/invoices/[id]/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    await ensureInvoiceTables()

    const invoice = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    if (invoice.length === 0) return err('Invoice not found', 404)
    const hasAccess = user.stores?.some((s: { id: string }) => s.id === invoice[0].storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(`SELECT * FROM InvoiceItem WHERE invoiceId = ? ORDER BY rowid ASC`, [id])
    return NextResponse.json(items)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/invoices/[id]/items
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    await ensureInvoiceTables()

    const invoice = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    if (invoice.length === 0) return err('Invoice not found', 404)
    const inv = invoice[0]
    const hasAccess = user.stores?.some((s: { id: string }) => s.id === inv.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)
    if (inv.status === 'PAID' || inv.status === 'CANCELLED') {
      return err(`Cannot add items to a ${inv.status} invoice`, 400)
    }

    const b = (await req.json()) as any
    if (!b.description) return err('description is required')

    const qty       = Number(b.qty ?? 1)
    const unitPrice = Number(b.unitPrice ?? 0)
    const total     = calcItemTotal(qty, unitPrice)
    const itemId    = newId()

    await exec(
      `INSERT INTO InvoiceItem (id, invoiceId, storeId, description, qty, unitPrice, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, id, inv.storeId, b.description, qty, unitPrice, total]
    )

    // Recalculate invoice subtotal + total
    const allItems = await query(`SELECT total FROM InvoiceItem WHERE invoiceId = ?`, [id]) as any[]
    const subtotal  = allItems.reduce((s: number, r: any) => s + Number(r.total), 0)
    const taxAmount = Number(inv.taxAmount ?? 0)
    const newTotal  = Math.round((subtotal + taxAmount) * 100) / 100
    await exec(
      `UPDATE Invoice SET subtotal = ?, total = ?, updatedAt = datetime('now') WHERE id = ?`,
      [subtotal, newTotal, id]
    )

    const created = await query(`SELECT * FROM InvoiceItem WHERE id = ?`, [itemId]) as any[]
    return NextResponse.json(created[0], { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
