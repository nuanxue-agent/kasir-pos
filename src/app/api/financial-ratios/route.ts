import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { computeRatios } from '@/lib/financial-ratios'
import { ensureFinancialSnapshotTable } from '../financial-snapshots/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureFinancialSnapshotTable()

    const period = sp.get('period')

    // Fetch snapshots — latest per period for trend, or single period
    const snapshots = period
      ? await query(
          `SELECT * FROM FinancialSnapshot WHERE storeId = ? AND period = ? ORDER BY computedAt DESC LIMIT 1`,
          [storeId, period],
        )
      : await query(
          `SELECT * FROM FinancialSnapshot WHERE storeId = ?
           GROUP BY period
           ORDER BY period DESC
           LIMIT 12`,
          [storeId],
        )

    const result = (snapshots as any[]).map((s) => ({
      ...s,
      ratios: computeRatios(s),
    }))

    return ok(result)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
