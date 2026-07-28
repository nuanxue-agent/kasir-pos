import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureCohortTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CohortData (
      id            TEXT PRIMARY KEY,
      storeId       TEXT NOT NULL,
      cohortMonth   TEXT NOT NULL,
      periodOffset  INTEGER NOT NULL DEFAULT 0,
      customers     INTEGER NOT NULL DEFAULT 0,
      retained      INTEGER NOT NULL DEFAULT 0,
      retentionRate REAL NOT NULL DEFAULT 0,
      revenue       REAL NOT NULL DEFAULT 0,
      computedAt    TEXT NOT NULL
    )
  `)
  await exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS CohortData_store_month_offset
     ON CohortData(storeId, cohortMonth, periodOffset)`,
  ).catch(() => {})
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureCohortTable()

  const rows = await query(
    `SELECT * FROM CohortData WHERE storeId = ?
     ORDER BY cohortMonth ASC, periodOffset ASC`,
    [storeId],
  )

  // Build grid structure
  const cohortSet: Record<string, number> = {}
  const maxOffset: Record<string, number> = {}

  for (const r of rows as any[]) {
    cohortSet[r.cohortMonth] = r.customers
    maxOffset[r.cohortMonth] = Math.max(maxOffset[r.cohortMonth] ?? 0, r.periodOffset)
  }

  return NextResponse.json({
    rows,
    cohorts: Object.keys(cohortSet).sort(),
    maxPeriod: Math.max(0, ...Object.values(maxOffset)),
  })
}
