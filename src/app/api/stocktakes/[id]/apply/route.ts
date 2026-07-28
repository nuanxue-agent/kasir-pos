// POST /api/stocktakes/[id]/apply  — apply counted quantities to system stock
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureStocktakeTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  await ensureStocktakeTables()

  // Load the stocktake
  const rows = await query(`SELECT * FROM Stocktake WHERE id = ?`, [id])
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  const take = rows[0] as any

  if (take.status === 'COMPLETED') {
    return err('Stocktake already applied', 400, 'ALREADY_APPLIED')
  }

  // Load items with non-null countedQty
  const items = await query(
    `SELECT si.*, p.name AS productName
     FROM StocktakeItem si
     JOIN Product p ON p.id = si.productId
     WHERE si.stocktakeId = ? AND si.countedQty IS NOT NULL`,
    [id],
  )

  if (items.length === 0) {
    return err('No counted items to apply', 400, 'NO_COUNTED_ITEMS')
  }

  const t = nowISO()
  const storeId = take.storeId
  const appliedBy = (user as any).email ?? null
  let adjustmentsCreated = 0

  for (const item of items as any[]) {
    if (item.variance === 0) continue

    // Update product stock to counted quantity
    await exec(
      `UPDATE Product SET stock = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
      [item.countedQty, t, item.productId, storeId],
    )

    // Create stock adjustment log (best-effort — table may not exist)
    const adjId = newId()
    await exec(
      `CREATE TABLE IF NOT EXISTS StockAdjustment (
        id          TEXT PRIMARY KEY,
        storeId     TEXT NOT NULL,
        productId   TEXT NOT NULL,
        qty         REAL NOT NULL,
        type        TEXT NOT NULL DEFAULT 'STOCKTAKE',
        reason      TEXT,
        reference   TEXT,
        adjustedBy  TEXT,
        createdAt   TEXT NOT NULL
      )`,
    ).catch(() => {})

    await exec(
      `INSERT INTO StockAdjustment (id, storeId, productId, qty, type, reason, reference, adjustedBy, createdAt)
       VALUES (?, ?, ?, ?, 'STOCKTAKE', ?, ?, ?, ?)`,
      [
        adjId,
        storeId,
        item.productId,
        item.variance,
        `Stocktake adjustment: ${item.variance > 0 ? 'surplus' : 'shortage'}`,
        `stocktake:${id}`,
        appliedBy,
        t,
      ],
    ).catch(() => {})

    adjustmentsCreated++
  }

  // Mark stocktake as COMPLETED
  await exec(
    `UPDATE Stocktake SET status = 'COMPLETED', completedAt = ?, completedBy = ?, updatedAt = ? WHERE id = ?`,
    [t, appliedBy, t, id],
  )

  const [updated] = await query(`SELECT * FROM Stocktake WHERE id = ?`, [id])

  return NextResponse.json({
    ok: true,
    adjustmentsCreated,
    stocktake: updated,
  })
}
