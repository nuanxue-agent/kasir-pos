// GET /api/complaints/stats?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Complaint (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      customerId  TEXT,
      customerName TEXT,
      orderId     TEXT,
      category    TEXT NOT NULL DEFAULT 'OTHER',
      description TEXT NOT NULL,
      priority    TEXT NOT NULL DEFAULT 'MEDIUM',
      status      TEXT NOT NULL DEFAULT 'NEW',
      assignedTo  TEXT,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL,
      resolvedAt  TEXT,
      resolution  TEXT
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const [statusRows, categoryRows, priorityRows, resolutionRows] = await Promise.all([
    query(
      `SELECT status, COUNT(*) as count FROM Complaint WHERE storeId = ? GROUP BY status`,
      [storeId],
    ),
    query(
      `SELECT category, COUNT(*) as count FROM Complaint WHERE storeId = ? GROUP BY category`,
      [storeId],
    ),
    query(
      `SELECT priority, COUNT(*) as count FROM Complaint WHERE storeId = ? GROUP BY priority`,
      [storeId],
    ),
    query(
      `SELECT AVG(
         (julianday(resolvedAt) - julianday(createdAt)) * 24
       ) as avgHours,
       COUNT(*) as resolvedCount
       FROM Complaint
       WHERE storeId = ? AND resolvedAt IS NOT NULL`,
      [storeId],
    ),
  ])

  const statusCounts: Record<string, number> = {}
  for (const row of statusRows as any[]) {
    statusCounts[row.status] = Number(row.count)
  }

  const byCategoryObj: Record<string, number> = {}
  for (const row of categoryRows as any[]) {
    byCategoryObj[row.category] = Number(row.count)
  }

  const byPriorityObj: Record<string, number> = {}
  for (const row of priorityRows as any[]) {
    byPriorityObj[row.priority] = Number(row.count)
  }

  const resRow = (resolutionRows as any[])[0]
  const avgResolutionHours = resRow?.avgHours ? Number(resRow.avgHours) : null
  const resolvedCount = Number(resRow?.resolvedCount ?? 0)

  const totalComplaints = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const resolutionRate = totalComplaints > 0
    ? Math.round(((statusCounts.RESOLVED ?? 0) + (statusCounts.CLOSED ?? 0)) / totalComplaints * 100)
    : 0

  return NextResponse.json({
    totalComplaints,
    newCount: statusCounts.NEW ?? 0,
    assignedCount: statusCounts.ASSIGNED ?? 0,
    inProgressCount: statusCounts.IN_PROGRESS ?? 0,
    resolvedCount: statusCounts.RESOLVED ?? 0,
    closedCount: statusCounts.CLOSED ?? 0,
    avgResolutionHours,
    resolutionRate,
    byCategory: byCategoryObj,
    byPriority: byPriorityObj,
  })
}
