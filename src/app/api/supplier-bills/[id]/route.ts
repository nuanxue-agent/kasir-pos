// PATCH /api/supplier-bills/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureSupplierBillTable, type BillStatus } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_STATUSES: BillStatus[] = ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE']

// PATCH /api/supplier-bills/[id]?storeId=xxx
// Body: { paidAmount?, status? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    const bill = await queryOne<Record<string, unknown>>(
      `SELECT * FROM SupplierBill WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!bill) return err('Bill not found', 404)

    const body = await req.json() as {
      paidAmount?: number
      status?: BillStatus
    }

    const sets: string[] = []
    const values: unknown[] = []

    if (body.paidAmount !== undefined) {
      const paid = Number(body.paidAmount)
      if (paid < 0) return err('paidAmount cannot be negative')
      sets.push('paidAmount = ?')
      values.push(paid)

      // Auto-derive status from paid amount unless explicitly overridden
      if (body.status === undefined) {
        const amount = bill.amount as number
        let derivedStatus: BillStatus = 'PENDING'
        if (paid >= amount) derivedStatus = 'PAID'
        else if (paid > 0) derivedStatus = 'PARTIAL'
        sets.push('status = ?')
        values.push(derivedStatus)
      }
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) return err('Invalid status')
      sets.push('status = ?')
      values.push(body.status)
    }

    if (sets.length === 0) return err('Nothing to update')

    values.push(id, storeId)
    await exec(`UPDATE SupplierBill SET ${sets.join(', ')} WHERE id = ? AND storeId = ?`, values)

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM SupplierBill WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
