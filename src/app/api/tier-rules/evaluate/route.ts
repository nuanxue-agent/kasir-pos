// POST /api/tier-rules/evaluate?storeId=
// Batch-evaluate all customers against tier rules and update their tiers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTierTables } from '../route'
import { evaluateCustomerTier } from '@/lib/tier-automation'
import type { CustomerActivity, TierRule } from '@/lib/tier-automation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTierTables()

  // Load active tier rules for this store
  const ruleRows = await query(
    `SELECT * FROM TierRule WHERE storeId = ? AND active = 1 ORDER BY minSpend ASC`,
    [storeId],
  )
  const rules: TierRule[] = (ruleRows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    benefits: JSON.parse(r.benefits || '{}'),
  }))

  if (rules.length === 0) {
    return NextResponse.json({ evaluated: 0, changed: 0, message: 'No active tier rules' })
  }

  // Load all customers for this store with their aggregated activity
  // Falls back gracefully if Orders/LoyaltyPoints tables don't exist yet
  const customerRows = await query(
    `SELECT id, name, loyaltyTier, loyaltyPoints FROM Customer WHERE storeId = ? AND (active = 1 OR active IS NULL)`,
    [storeId],
  ).catch(() => [] as any[])

  if ((customerRows as any[]).length === 0) {
    return NextResponse.json({ evaluated: 0, changed: 0, message: 'No customers found' })
  }

  // Aggregate spend + visit counts from Orders (best-effort)
  const spendRows = await query(
    `SELECT customerId,
            COALESCE(SUM(total), 0) as totalSpend,
            COUNT(*) as totalVisits
     FROM Orders
     WHERE storeId = ? AND status = 'completed' AND customerId IS NOT NULL
     GROUP BY customerId`,
    [storeId],
  ).catch(() => [] as any[])

  const spendMap = new Map<string, { totalSpend: number; totalVisits: number }>()
  for (const row of spendRows as any[]) {
    spendMap.set(row.customerId, {
      totalSpend: row.totalSpend ?? 0,
      totalVisits: row.totalVisits ?? 0,
    })
  }

  const now = nowISO()
  let changedCount = 0
  const historyInserts: Promise<void>[] = []

  for (const customer of customerRows as any[]) {
    const activityData = spendMap.get(customer.id) ?? { totalSpend: 0, totalVisits: 0 }
    const activity: CustomerActivity = {
      customerId: customer.id,
      storeId,
      totalSpend: activityData.totalSpend,
      totalPoints: customer.loyaltyPoints ?? 0,
      totalVisits: activityData.totalVisits,
      currentTier: customer.loyaltyTier ?? null,
    }

    const result = evaluateCustomerTier(activity, rules)
    if (!result.changed) continue

    changedCount++

    // Update customer tier (Customer table may use loyaltyTier column)
    await exec(
      `UPDATE Customer SET loyaltyTier = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
      [result.qualifiedTier, now, customer.id, storeId],
    ).catch(() => {})

    // Write history record
    historyInserts.push(
      exec(
        `INSERT INTO TierHistory (id, customerId, storeId, fromTier, toTier, reason, changedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), customer.id, storeId, result.currentTier, result.qualifiedTier, result.reason, now],
      ).catch(() => {}),
    )
  }

  await Promise.all(historyInserts)

  return NextResponse.json({
    evaluated: (customerRows as any[]).length,
    changed: changedCount,
    message: `Evaluated ${(customerRows as any[]).length} customers, ${changedCount} tier changes applied`,
  })
}
