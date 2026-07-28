// POST /api/pricing-rules/preview
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function applyAdjustment(price: number, adjustment: string, value: number): number {
  if (adjustment === 'PERCENTAGE') {
    return Math.round(price * (1 + value / 100))
  }
  return Math.max(0, price + value)
}

function evaluateRule(rule: any, product: any, now = new Date()): { applies: boolean; effectivePrice: number } {
  const cond = rule.conditions || {}
  let applies = false

  if (rule.ruleType === 'TIME_BASED') {
    const hour = now.getHours()
    const startHour = cond.startHour ?? 0
    const endHour = cond.endHour ?? 24
    applies = hour >= startHour && hour < endHour
  } else if (rule.ruleType === 'STOCK_BASED') {
    const stock = product.stock ?? 0
    const threshold = cond.threshold ?? 0
    const operator = cond.operator || 'GT'
    applies = operator === 'GT' ? stock > threshold : stock < threshold
  } else if (rule.ruleType === 'DEMAND_BASED' || rule.ruleType === 'SURGE') {
    applies = true
  }

  const effectivePrice = applies ? applyAdjustment(product.price, rule.adjustment, rule.value) : product.price
  return { applies, effectivePrice }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (!b.rule) return err("Field 'rule' is required", 400, 'MISSING_FIELD')

  // Fetch product
  const rows = await query(
    `SELECT id, name, price, stock FROM Product WHERE id = ? LIMIT 1`,
    [b.productId],
  )

  if (!rows || rows.length === 0) return err('Product not found', 404, 'NOT_FOUND')

  const product = rows[0] as any

  const { applies, effectivePrice } = evaluateRule(b.rule, product)

  return NextResponse.json({
    productId: product.id,
    originalPrice: product.price,
    effectivePrice,
    applies,
  })
}
