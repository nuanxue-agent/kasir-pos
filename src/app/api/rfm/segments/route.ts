// GET /api/rfm/segments?storeId= — segment distribution counts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureRFMTable } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const SEGMENT_ORDER = [
  'Champions',
  'Loyal',
  'New',
  'AtRisk',
  'Lost',
] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureRFMTable()

  const rows = await query(
    `SELECT segment, COUNT(*) as count, AVG(monetaryTotal) as avgMonetary
     FROM CustomerRFM
     WHERE storeId = ?
     GROUP BY segment
     ORDER BY count DESC`,
    [storeId],
  ) as any[]

  const total = rows.reduce((s: number, r: any) => s + Number(r.count), 0)

  // Build a map for quick lookup, then return in canonical order
  const map: Record<string, { count: number; avgMonetary: number; pct: number }> = {}
  for (const r of rows) {
    map[r.segment] = {
      count: Number(r.count),
      avgMonetary: Number(r.avgMonetary ?? 0),
      pct: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
    }
  }

  const distribution = SEGMENT_ORDER.map((seg) => ({
    segment: seg,
    count: map[seg]?.count ?? 0,
    avgMonetary: map[seg]?.avgMonetary ?? 0,
    pct: map[seg]?.pct ?? 0,
  }))

  return NextResponse.json({ total, distribution })
}
