// POST /api/supplier-invoices/[id]/pay
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/supplier-invoices/[id]/pay?storeId=xxx
// Body: { amount, paymentMethod?, note?, paidAt? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params
    const invoice = await queryOne<{ id: string; storeId: string; total: number; status: string }>(
      `SELECT id, storeId, total, status FROM SupplierInvoice WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!invoice) return err('Invoice not found', 404)
    if (invoice.status === 'PAID') return err('Invoice already fully paid')

    const body = await req.json() as {
      amount?: number
      paymentMethod?: string
      note?: string
      paidAt?: string
    }

    if (!body.amount || body.amount <= 0) return err('amount must be positive')

    // Calculate current paid total
    const paymentRows = await query<{ paid: number }>(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM SupplierPayment WHERE invoiceId = ?`,
      [id]
    )
    const alreadyPaid = paymentRows[0]?.paid ?? 0
    const balance = invoice.total - alreadyPaid

    if (body.amount > balance + 0.001) {
      return err(`Payment amount (${body.amount}) exceeds outstanding balance (${balance})`)
    }

    const paymentId = newId()
    const paidAt = body.paidAt ?? nowISO()

    await exec(
      `INSERT INTO SupplierPayment (id, invoiceId, storeId, amount, paymentMethod, paidAt, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, id, storeId, body.amount, body.paymentMethod ?? 'TRANSFER', paidAt, body.note ?? null]
    )

    // Update invoice status
    const newPaid = alreadyPaid + body.amount
    const newStatus = newPaid >= invoice.total - 0.001 ? 'PAID' : 'PARTIAL'
    await exec(`UPDATE SupplierInvoice SET status = ? WHERE id = ?`, [newStatus, id])

    return ok({
      paymentId,
      invoiceId: id,
      amount: body.amount,
      paymentMethod: body.paymentMethod ?? 'TRANSFER',
      paidAt,
      newStatus,
      totalPaid: newPaid,
      balance: invoice.total - newPaid,
    }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
