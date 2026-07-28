// PATCH /api/assembly-jobs/[id]  — advance status / complete job
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { isValidAssemblyTransition, calcAssemblyStockUpdate } from '@/lib/kitting'
import type { AssemblyStatus } from '@/lib/kitting'
import { ensureKitTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureKitTables()

  const rows = await query(`SELECT * FROM AssemblyJob WHERE id = ?`, [id])
  const job = (rows as any[])[0]
  if (!job) return err('Assembly job not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.status) return err("'status' is required", 400, 'MISSING_FIELD')

  const currentStatus = job.status as AssemblyStatus
  const newStatus     = b.status  as AssemblyStatus

  if (!isValidAssemblyTransition(currentStatus, newStatus)) {
    return err(
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  const t = nowISO()
  const sets: string[] = ['status = ?', 'updatedAt = ?']
  const vals: any[]    = [newStatus, t]

  if (newStatus === 'IN_PROGRESS') {
    sets.push('startedAt = ?')
    vals.push(t)
  }

  if (newStatus === 'COMPLETED') {
    sets.push('completedAt = ?')
    vals.push(t)
  }

  vals.push(id)
  await exec(`UPDATE AssemblyJob SET ${sets.join(', ')} WHERE id = ?`, vals)

  // On COMPLETED: deduct components, add output product to stock
  if (newStatus === 'COMPLETED') {
    const kitRows = await query(`SELECT * FROM Kit WHERE id = ?`, [job.kitId])
    const kit = (kitRows as any[])[0]

    if (kit) {
      const compRows = await query(
        `SELECT * FROM KitComponent WHERE kitId = ?`,
        [job.kitId],
      )
      const components = (compRows as any[]).map(r => ({
        ...r,
        requiredQty: Number(r.requiredQty),
      }))

      const actualQty = Number(b.actualQty ?? job.targetQty)
      const stockUpdates = calcAssemblyStockUpdate(components, kit, actualQty)

      for (const update of stockUpdates) {
        await exec(
          `UPDATE Product SET stock = COALESCE(stock, 0) + ?, updatedAt = ? WHERE id = ?`,
          [update.delta, t, update.productId],
        )
      }
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
