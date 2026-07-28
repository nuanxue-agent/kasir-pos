// PATCH /api/goods-receipts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureGoodsReceiptTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const rows = await query(`SELECT * FROM GoodsReceipt WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('Not found', 404)

    const b = (await req.json()) as any
    const sets: string[] = []
    const vals: unknown[] = []

    if (b.status !== undefined) {
      const valid = ['PENDING', 'INSPECTING', 'ACCEPTED', 'REJECTED', 'PARTIAL']
      if (!valid.includes(b.status)) return err('Invalid status')
      sets.push('status = ?'); vals.push(b.status)
    }
    if (b.notes !== undefined) { sets.push('notes = ?'); vals.push(b.notes) }
    if (b.receivedBy !== undefined) { sets.push('receivedBy = ?'); vals.push(b.receivedBy) }
    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)
    await exec(`UPDATE GoodsReceipt SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const rows = await query(`SELECT * FROM GoodsReceipt WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('Not found', 404)

    const items = await query(
      `SELECT gri.*, p.name as productName
       FROM GoodsReceiptItem gri
       LEFT JOIN Product p ON gri.productId = p.id
       WHERE gri.receiptId = ?
       ORDER BY gri.createdAt ASC`,
      [id]
    ) as any[]

    return ok({ ...rows[0], items })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
