// GET /api/price-adjustment-logs?storeId=&productId=&limit=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PriceAdjustmentLog (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    ruleId    TEXT NOT NULL,
    oldPrice  REAL NOT NULL,
    newPrice  REAL NOT NULL,
    appliedAt TEXT NOT NULL,
    reason    TEXT NOT NULL DEFAULT ''
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  const productId = sp.get('productId')
  const limit = Math.min(Number(sp.get('limit') ?? '100'), 500)

  await ensureTables()

  const params: any[] = [storeId]
  let sql = `
    SELECT
      l.id, l.storeId, l.productId, l.ruleId,
      l.oldPrice, l.newPrice, l.appliedAt, l.reason,
      p.name AS productName,
      r.name AS ruleName
    FROM PriceAdjustmentLog l
    LEFT JOIN Product p ON p.id = l.productId
    LEFT JOIN PricingRule r ON r.id = l.ruleId
    WHERE l.storeId = ?
  `

  if (productId) {
    sql += ` AND l.productId = ?`
    params.push(productId)
  }

  sql += ` ORDER BY l.appliedAt DESC LIMIT ?`
  params.push(limit)

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}
