// GET /api/lots/expiring?storeId=&days=30|60|90
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { daysUntilExpiry } from '@/lib/lot-tracking'
import { ensureLotTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const rawDays = req.nextUrl.searchParams.get('days') ?? '30'
  const days    = parseInt(rawDays, 10)
  if (![30, 60, 90].includes(days)) return err("'days' must be 30, 60, or 90", 400, 'INVALID_FIELD')

  await ensureLotTable()

  const now    = new Date()
  const today  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const cutoff = new Date(today)
  cutoff.setUTCDate(cutoff.getUTCDate() + days)

  const todayStr  = today.toISOString().split('T')[0]
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const rows = await query(`
    SELECT
      l.id, l.storeId, l.productId, l.lotNumber,
      l.expiryDate, l.receivedDate, l.initialQty, l.remainingQty,
      l.supplierId, l.costPerUnit, l.status,
      l.createdAt, l.updatedAt,
      p.name AS productName,
      s.name AS supplierName
    FROM Lot l
    LEFT JOIN Product p ON p.id = l.productId
    LEFT JOIN Supplier s ON s.id = l.supplierId
    WHERE l.storeId = ?
      AND l.status = 'ACTIVE'
      AND l.remainingQty > 0
      AND l.expiryDate >= ?
      AND l.expiryDate <= ?
    ORDER BY l.expiryDate ASC
  `, [storeId, todayStr, cutoffStr])

  const result = (rows as any[]).map(r => ({
    ...r,
    daysUntilExpiry: daysUntilExpiry(r.expiryDate, now),
  }))

  return NextResponse.json(result)
}
