import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../digital-products/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// ── Pure business logic (exported for unit tests) ─────────────────────────────

export function calcMarginAmount(price: number, marginPct: number): number {
  if (price <= 0) return 0
  return Math.round(price * marginPct) / 100
}

export function calcSellingPrice(denomination: number, marginPct: number): number {
  if (denomination <= 0) return 0
  return denomination + calcMarginAmount(denomination, marginPct)
}

export function isValidSerialNumber(serial: string): boolean {
  if (!serial || serial.trim().length === 0) return false
  // Serial: 8–32 alphanumeric chars (uppercase letters and digits)
  return /^[A-Z0-9]{8,32}$/.test(serial.trim())
}

export type SaleStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

const ALLOWED_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  PENDING: ['SUCCESS', 'FAILED'],
  SUCCESS: [],
  FAILED:  ['PENDING'],
}

export function isValidStatusTransition(from: SaleStatus, to: SaleStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function aggregateSalesByCategory(
  sales: Array<{ category: string; price: number; status: SaleStatus }>
): Record<string, { count: number; revenue: number }> {
  const result: Record<string, { count: number; revenue: number }> = {}
  for (const sale of sales) {
    if (sale.status !== 'SUCCESS') continue
    if (!result[sale.category]) result[sale.category] = { count: 0, revenue: 0 }
    result[sale.category].count += 1
    result[sale.category].revenue += sale.price
  }
  return result
}

export function aggregateDailySales(
  sales: Array<{ createdAt: string; price: number; status: SaleStatus }>
): Record<string, { count: number; revenue: number }> {
  const result: Record<string, { count: number; revenue: number }> = {}
  for (const sale of sales) {
    if (sale.status !== 'SUCCESS') continue
    const day = sale.createdAt.slice(0, 10)
    if (!result[day]) result[day] = { count: 0, revenue: 0 }
    result[day].count += 1
    result[day].revenue += sale.price
  }
  return result
}

// ── API handlers ──────────────────────────────────────────────────────────────

// GET /api/digital-sales?storeId=&status=&category=&from=&to=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const conditions: string[] = ['ds.storeId = ?']
    const params: any[] = [storeId]

    const status = url.searchParams.get('status')
    if (status) { conditions.push('ds.status = ?'); params.push(status) }

    const from = url.searchParams.get('from')
    if (from) { conditions.push('ds.createdAt >= ?'); params.push(from) }

    const to = url.searchParams.get('to')
    if (to) { conditions.push('ds.createdAt <= ?'); params.push(to) }

    const category = url.searchParams.get('category')
    if (category) { conditions.push('dp.category = ?'); params.push(category) }

    const rows = await query(
      `SELECT ds.*, dp.name AS productName, dp.category, dp.denomination, dp.provider
       FROM DigitalSale ds
       LEFT JOIN DigitalProduct dp ON ds.productId = dp.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ds.createdAt DESC`,
      params
    )

    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/digital-sales?storeId=
// Body: { productId, customerPhone, orderId? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const b = (await req.json()) as any
    if (!b.productId) return err("Field 'productId' is required")
    if (!b.customerPhone) return err("Field 'customerPhone' is required")

    // Verify product exists and is active
    const prodRows = await query(
      `SELECT * FROM DigitalProduct WHERE id = ? AND storeId = ? AND active = 1`,
      [b.productId, storeId]
    )
    if (prodRows.length === 0) return err('Product not found or inactive', 404)

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO DigitalSale (id, storeId, orderId, productId, customerPhone, serialNumber, status, processedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.orderId ?? null, b.productId, b.customerPhone, null, 'PENDING', null, t, t]
    )

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
