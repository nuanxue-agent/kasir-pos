import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureSalesTargetTables } from '../route'
import { calcAchievementPct, getCurrentPeriodString } from '@/lib/sales-targets'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId || !storeIds.includes(storeId))
    return err('Store not found', 403, 'FORBIDDEN')

  const recompute = sp.get('recompute') === '1'

  try {
    await ensureSalesTargetTables()

    // Load all active targets for this store
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    const targets = await query(
      `SELECT * FROM SalesTarget WHERE storeId = ? AND startDate <= ? AND endDate >= ?
       ORDER BY createdAt DESC`,
      [storeId, today, today]
    ) as any[]

    if (targets.length === 0) return NextResponse.json([])

    const results: any[] = []

    for (const target of targets) {
      const periodStr = getCurrentPeriodString(target.period, now)

      // Compute actual sales for this target
      let actualAmount = 0

      if (target.targetType === 'STORE') {
        // Sum all completed orders in the period
        const periodRows = await query(
          `SELECT COALESCE(SUM(total), 0) as total
           FROM Orders
           WHERE storeId = ? AND status = 'completed'
             AND date(createdAt) >= ? AND date(createdAt) < ?`,
          [storeId, target.startDate, target.endDate]
        ).catch(() => [{ total: 0 }]) as any[]
        actualAmount = Number(periodRows[0]?.total ?? 0)

      } else if (target.targetType === 'EMPLOYEE') {
        // Sum orders for this employee/cashier
        const empRows = await query(
          `SELECT COALESCE(SUM(o.total), 0) as total
           FROM Orders o
           WHERE o.storeId = ? AND o.status = 'completed'
             AND o.cashierId = ?
             AND date(o.createdAt) >= ? AND date(o.createdAt) < ?`,
          [storeId, target.targetId, target.startDate, target.endDate]
        ).catch(() => [{ total: 0 }]) as any[]
        actualAmount = Number(empRows[0]?.total ?? 0)

      } else if (target.targetType === 'PRODUCT_CATEGORY') {
        // Sum revenue for products in this category
        const catRows = await query(
          `SELECT COALESCE(SUM(oi.price * oi.qty), 0) as total
           FROM OrderItem oi
           JOIN Orders o ON oi.orderId = o.id
           JOIN Product p ON oi.productId = p.id
           WHERE o.storeId = ? AND o.status = 'completed'
             AND p.category = ?
             AND date(o.createdAt) >= ? AND date(o.createdAt) < ?`,
          [storeId, target.targetId, target.startDate, target.endDate]
        ).catch(() => [{ total: 0 }]) as any[]
        actualAmount = Number(catRows[0]?.total ?? 0)
      }

      const achievementPct = calcAchievementPct(actualAmount, target.targetAmount)

      if (recompute) {
        // Upsert achievement record
        const existing = await query(
          `SELECT id FROM SalesAchievement WHERE targetId = ? AND period = ?`,
          [target.id, periodStr]
        ) as any[]

        const computedAt = nowISO()
        if (existing.length > 0) {
          await exec(
            `UPDATE SalesAchievement
             SET actualAmount = ?, achievementPct = ?, computedAt = ?
             WHERE targetId = ? AND period = ?`,
            [actualAmount, achievementPct, computedAt, target.id, periodStr]
          )
        } else {
          await exec(
            `INSERT INTO SalesAchievement (id, targetId, storeId, actualAmount, achievementPct, period, computedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [newId(), target.id, storeId, actualAmount, achievementPct, periodStr, computedAt]
          )
        }
      }

      results.push({
        ...target,
        actualAmount,
        achievementPct,
        periodStr,
        isOverAchieved: achievementPct >= 100,
      })
    }

    // Sort by achievement % descending (leaderboard order)
    results.sort((a, b) => b.achievementPct - a.achievementPct)

    return NextResponse.json(results)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500, 'INTERNAL_ERROR')
  }
}
