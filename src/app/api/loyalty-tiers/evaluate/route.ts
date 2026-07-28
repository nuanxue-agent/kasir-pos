// POST /api/loyalty-tiers/evaluate
// Evaluate all customers for a store and trigger tier upgrades/downgrades
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTierTables } from '../../tier-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureLoyaltyTierTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS LoyaltyTier (
      id              TEXT PRIMARY KEY,
      storeId         TEXT NOT NULL,
      name            TEXT NOT NULL,
      minPoints       INTEGER NOT NULL DEFAULT 0,
      maxPoints       INTEGER,
      discountPct     REAL NOT NULL DEFAULT 0,
      bonusMultiplier REAL NOT NULL DEFAULT 1,
      badgeColor      TEXT NOT NULL DEFAULT '#CD7F32',
      active          INTEGER NOT NULL DEFAULT 1,
      createdAt       TEXT NOT NULL
    )
  `)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ??
    ((await req.json().catch(() => ({}))) as any).storeId ??
    user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  // Ensure both tables exist
  await ensureTierTables()
  await ensureLoyaltyTierTable()

  // Load active tiers for this store, sorted ascending by minPoints
  const tiers = (await query(
    `SELECT * FROM LoyaltyTier WHERE storeId = ? AND active = 1 ORDER BY minPoints ASC`,
    [storeId],
  )) as any[]

  if (tiers.length === 0) {
    return NextResponse.json({ evaluated: 0, upgrades: 0, downgrades: 0, message: 'No active tiers configured' })
  }

  // Load all customers with their current loyalty points for this store
  const customers = (await query(
    `SELECT id, loyaltyTier, loyaltyPoints FROM Customer WHERE storeId = ?`,
    [storeId],
  )) as any[]

  let upgrades = 0
  let downgrades = 0
  const historyRows: any[] = []
  const now = nowISO()

  for (const customer of customers) {
    const points: number = Number(customer.loyaltyPoints ?? 0)

    // Find the correct tier for this customer's points
    // Sort descending so first match wins
    const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints)
    const targetTier = sorted.find((t) => points >= t.minPoints) ?? tiers[0]
    const currentTierName: string | null = customer.loyaltyTier ?? null

    if (currentTierName === targetTier.name) continue // no change needed

    // Determine direction
    const currentTierObj = tiers.find((t) => t.name === currentTierName)
    const isUpgrade =
      !currentTierObj || targetTier.minPoints > (currentTierObj?.minPoints ?? -1)

    const reason: 'UPGRADE' | 'DOWNGRADE' = isUpgrade ? 'UPGRADE' : 'DOWNGRADE'
    if (reason === 'UPGRADE') upgrades++
    else downgrades++

    // Update customer tier
    await exec(`UPDATE Customer SET loyaltyTier = ? WHERE id = ? AND storeId = ?`, [
      targetTier.name,
      customer.id,
      storeId,
    ])

    // Record history
    historyRows.push({
      id: newId(),
      customerId: customer.id,
      storeId,
      fromTier: currentTierName,
      toTier: targetTier.name,
      reason,
      changedAt: now,
    })
  }

  // Bulk-insert history rows
  for (const h of historyRows) {
    await exec(
      `INSERT INTO TierHistory (id, customerId, storeId, fromTier, toTier, reason, changedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [h.id, h.customerId, h.storeId, h.fromTier, h.toTier, h.reason, h.changedAt],
    )
  }

  return NextResponse.json({
    evaluated: customers.length,
    upgrades,
    downgrades,
    changes: historyRows.length,
  })
}
