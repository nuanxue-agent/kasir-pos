import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { isValidSerialNumber, isValidStatusTransition, type SaleStatus } from '../route'
import { ensureTables } from '../../digital-products/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/digital-sales/[id]
// Body: { status?, serialNumber?, processedAt? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params

    await ensureTables()

    const rows = await query(`SELECT * FROM DigitalSale WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)

    const current = rows[0] as any
    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    if (b.status !== undefined) {
      const VALID_STATUSES: SaleStatus[] = ['PENDING', 'SUCCESS', 'FAILED']
      if (!VALID_STATUSES.includes(b.status)) return err('Invalid status')
      if (!isValidStatusTransition(current.status as SaleStatus, b.status as SaleStatus)) {
        return err(`Cannot transition from ${current.status} to ${b.status}`, 422)
      }
      sets.push('status = ?'); vals.push(b.status)

      // Auto-set processedAt when transitioning to SUCCESS or FAILED
      if (b.status === 'SUCCESS' || b.status === 'FAILED') {
        sets.push('processedAt = ?'); vals.push(b.processedAt ?? nowISO())
      }
    }

    if (b.serialNumber !== undefined) {
      if (b.serialNumber !== null && !isValidSerialNumber(b.serialNumber)) {
        return err('Invalid serial number format. Must be 8–32 uppercase alphanumeric characters.')
      }
      sets.push('serialNumber = ?'); vals.push(b.serialNumber)
    }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

    await exec(`UPDATE DigitalSale SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
