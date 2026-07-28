// POST /api/rfm/compute?storeId= — recompute RFM scores for all customers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { computeRFM } from '@/lib/rfm'
import { ensureRFMTable } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureRFMTable()

  // Pull raw customer stats from orders
  const statsRows = await query(
    `SELECT
       c.id,
       c.name,
       c.phone,
       c.email,
       CAST(julianday('now') - julianday(MAX(o.createdAt)) AS INTEGER) AS recency,
       COUNT(o.id) AS frequency,
       COALESCE(SUM(o.total), 0) AS monetary
     FROM Customer c
     JOIN Orders o ON o.customerId = c.id AND o.storeId = ?
     WHERE c.storeId = ?
     GROUP BY c.id`,
    [storeId, storeId],
  ).catch(() => []) as any[]

  if (statsRows.length === 0) {
    return NextResponse.json({ computed: 0, message: 'No customer order data found' })
  }

  const computed = computeRFM(
    statsRows.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? null,
      email: r.email ?? null,
      recency: Number(r.recency ?? 0),
      frequency: Number(r.frequency ?? 0),
      monetary: Number(r.monetary ?? 0),
    })),
  )

  const now = nowISO()

  for (const c of computed) {
    const rfmScore =
      c.scores.recencyScore + c.scores.frequencyScore + c.scores.monetaryScore

    // Check if row exists
    const existing = await query(
      `SELECT id FROM CustomerRFM WHERE storeId = ? AND customerId = ?`,
      [storeId, c.id],
    ) as any[]

    if (existing.length > 0) {
      await exec(
        `UPDATE CustomerRFM SET
           recencyDays = ?, frequencyCount = ?, monetaryTotal = ?,
           recencyScore = ?, frequencyScore = ?, monetaryScore = ?,
           rfmScore = ?, segment = ?, computedAt = ?
         WHERE storeId = ? AND customerId = ?`,
        [
          c.recency, c.frequency, c.monetary,
          c.scores.recencyScore, c.scores.frequencyScore, c.scores.monetaryScore,
          rfmScore, c.segment, now,
          storeId, c.id,
        ],
      )
    } else {
      await exec(
        `INSERT INTO CustomerRFM
           (id, storeId, customerId, recencyDays, frequencyCount, monetaryTotal,
            recencyScore, frequencyScore, monetaryScore, rfmScore, segment, computedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(), storeId, c.id,
          c.recency, c.frequency, c.monetary,
          c.scores.recencyScore, c.scores.frequencyScore, c.scores.monetaryScore,
          rfmScore, c.segment, now,
        ],
      )
    }
  }

  return NextResponse.json({ computed: computed.length, computedAt: now })
}
