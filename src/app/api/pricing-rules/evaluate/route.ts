// POST /api/pricing-rules/evaluate
// Body: { productId, currentPrice, storeId?, context? }
// Returns: { finalPrice, applied[] }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { applyRules, buildContext } from '@/lib/dynamic-pricing'
import type { PricingRule } from '@/lib/dynamic-pricing'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PricingRule (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'TIME_BASED',
    condition TEXT NOT NULL DEFAULT '{}',
    action    TEXT NOT NULL DEFAULT '{}',
    priority  INTEGER NOT NULL DEFAULT 10,
    active    INTEGER NOT NULL DEFAULT 1,
    validFrom TEXT,
    validTo   TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const body = await req.json() as any
  const storeId = body.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  const { productId, currentPrice } = body
  if (!productId) return err('productId required')
  if (typeof currentPrice !== 'number') return err('currentPrice must be a number')

  await ensureTables()

  // Load active rules for this store
  const rows = await query(
    `SELECT * FROM PricingRule WHERE storeId = ? AND active = 1 ORDER BY priority DESC`,
    [storeId],
  )

  const rules: PricingRule[] = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    condition: (() => { try { return JSON.parse(r.condition || '{}') } catch { return {} } })(),
    action: (() => { try { return JSON.parse(r.action || '{}') } catch { return {} } })(),
  }))

  // Build context — caller may supply extra context fields
  const now = new Date()
  const context = buildContext({
    hour: now.getHours(),
    stock: body.context?.stock,
    demandScore: body.context?.demandScore,
    competitorPrice: body.context?.competitorPrice,
  })

  const { finalPrice, applied } = applyRules(rules, currentPrice, context, now)

  // Persist logs for each applied rule
  const logNow = nowISO()
  for (const result of applied) {
    await exec(
      `INSERT INTO PriceAdjustmentLog (id, storeId, productId, ruleId, oldPrice, newPrice, appliedAt, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), storeId, productId, result.ruleId, result.oldPrice, result.newPrice, logNow, result.reason],
    )
  }

  return NextResponse.json({ finalPrice, applied, basePrice: currentPrice })
}
