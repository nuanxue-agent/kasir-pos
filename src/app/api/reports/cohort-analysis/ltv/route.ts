import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureCohortTable } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureCohortTable()

  // Aggregate revenue and max period per cohort
  const rows = await query(
    `SELECT
       cohortMonth,
       MAX(customers)                           AS customers,
       SUM(revenue)                             AS cumulativeRevenue,
       MAX(periodOffset) + 1                    AS periods,
       CASE WHEN MAX(customers) > 0
            THEN SUM(revenue) / MAX(customers)
            ELSE 0 END                          AS ltv,
       CASE WHEN MAX(customers) > 0 AND MAX(periodOffset) + 1 > 0
            THEN SUM(revenue) / MAX(customers) / (MAX(periodOffset) + 1)
            ELSE 0 END                          AS avgMonthlyRevenue
     FROM CohortData
     WHERE storeId = ?
     GROUP BY cohortMonth
     ORDER BY cohortMonth ASC`,
    [storeId],
  )

  return NextResponse.json(rows)
}
