import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureInvoiceTables } from '../route'
import { isValidStatusTransition, isOverdue } from '@/lib/invoices'
import type { InvoiceStatus } from '@/lib/invoices'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/invoices/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params

    await ensureInvoiceTables()

    const rows = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('Invoice not found', 404)
    const invoice = rows[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === invoice.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: unknown[] = []

    if (b.status !== undefined) {
      const newStatus = b.status as InvoiceStatus
      if (!isValidStatusTransition(invoice.status as InvoiceStatus, newStatus)) {
        return err(`Cannot transition from ${invoice.status} to ${newStatus}`, 400)
      }
      sets.push('status = ?'); vals.push(newStatus)
    }
    if (b.customerId   !== undefined) { sets.push('customerId = ?');   vals.push(b.customerId) }
    if (b.issueDate    !== undefined) { sets.push('issueDate = ?');    vals.push(b.issueDate) }
    if (b.dueDate      !== undefined) { sets.push('dueDate = ?');      vals.push(b.dueDate) }
    if (b.subtotal     !== undefined) { sets.push('subtotal = ?');     vals.push(Number(b.subtotal)) }
    if (b.taxAmount    !== undefined) { sets.push('taxAmount = ?');    vals.push(Number(b.taxAmount)) }
    if (b.total        !== undefined) { sets.push('total = ?');        vals.push(Number(b.total)) }
    if (b.notes        !== undefined) { sets.push('notes = ?');        vals.push(b.notes) }
    if (b.paymentTerms !== undefined) { sets.push('paymentTerms = ?'); vals.push(b.paymentTerms) }

    if (sets.length === 0) return err('No fields to update')
    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

    await exec(`UPDATE Invoice SET ${sets.join(', ')} WHERE id = ?`, vals)

    // Auto-mark overdue if dueDate changed
    const updatedRows = await query(`SELECT * FROM Invoice WHERE id = ?`, [id]) as any[]
    const updated = updatedRows[0]
    if (isOverdue(updated.dueDate, updated.status) && updated.status === 'SENT') {
      await exec(`UPDATE Invoice SET status = 'OVERDUE', updatedAt = ? WHERE id = ?`, [nowISO(), id])
      updated.status = 'OVERDUE'
    }

    return NextResponse.json(updated)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
