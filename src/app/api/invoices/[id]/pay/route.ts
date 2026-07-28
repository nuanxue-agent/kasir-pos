import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureInvoiceTables } from '../../route'
import { validatePaymentAmount, statusAfterPayment } from '@/lib/invoices'
import type { InvoiceStatus } from '@/lib/invoices'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/invoices/[id]/pay
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

    const invoiceRows = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    if (invoiceRows.length === 0) return err('Invoice not found', 404)
    const invoice = invoiceRows[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === invoice.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)
    if (invoice.status === 'PAID') return err('Invoice is already paid', 400)
    if (invoice.status === 'CANCELLED') return err('Cannot pay a cancelled invoice', 400)

    const b = (await req.json()) as any
    if (b.amount === undefined) return err('amount is required')
    const amount = Number(b.amount)

    // Sum existing payments
    const payRows = await query(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM InvoicePayment WHERE invoiceId = ?`,
      [id]
    ) as any[]
    const alreadyPaid = Number(payRows[0]?.paid ?? 0)

    const validation = validatePaymentAmount(amount, invoice.total, alreadyPaid)
    if (!validation.valid) return err(validation.error!, 400)

    const paymentId = newId()
    const paidAt    = b.paidAt ?? nowISO()
    await exec(
      `INSERT INTO InvoicePayment (id, invoiceId, storeId, amount, paymentMethod, paidAt, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, id, invoice.storeId, amount, b.paymentMethod ?? 'TRANSFER', paidAt, b.note ?? null]
    )

    const newStatus = statusAfterPayment(invoice.total, alreadyPaid + amount, invoice.status as InvoiceStatus)
    await exec(`UPDATE Invoice SET status = ?, updatedAt = ? WHERE id = ?`, [newStatus, nowISO(), id])

    return NextResponse.json({
      ok: true,
      paymentId,
      status: newStatus,
      amountPaid: alreadyPaid + amount,
      remaining: Math.max(0, invoice.total - alreadyPaid - amount),
    })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
