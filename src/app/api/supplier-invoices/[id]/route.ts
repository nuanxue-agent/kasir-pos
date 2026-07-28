// PATCH /api/supplier-invoices/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE']

// PATCH /api/supplier-invoices/[id]?storeId=xxx
// Body: { status?, dueDate?, invoiceNumber? }
export async function PATCH(
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
    const invoice = await queryOne<{ id: string; storeId: string; status: string }>(
      `SELECT id, storeId, status FROM SupplierInvoice WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!invoice) return err('Invoice not found', 404)

    const body = await req.json() as {
      status?: string
      dueDate?: string
      invoiceNumber?: string
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return err(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
    }

    const setClauses: string[] = []
    const setParams: unknown[] = []

    if (body.status) { setClauses.push('status = ?'); setParams.push(body.status) }
    if (body.dueDate) { setClauses.push('dueDate = ?'); setParams.push(body.dueDate) }
    if (body.invoiceNumber) { setClauses.push('invoiceNumber = ?'); setParams.push(body.invoiceNumber) }

    if (setClauses.length === 0) return err('No fields to update')

    setParams.push(id)
    await exec(
      `UPDATE SupplierInvoice SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM SupplierInvoice WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
