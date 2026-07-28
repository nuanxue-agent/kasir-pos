// GET/POST /api/bs-entries
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../bs-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface BSEntry {
  id: string
  storeId: string
  accountId: string
  amount: number
  period: string
  createdAt: string
}

// GET /api/bs-entries?storeId=xxx&period=2025-01
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const period = url.searchParams.get('period')
    if (!period) return err('period required (YYYY-MM)')
    if (!/^\d{4}-\d{2}$/.test(period)) return err('period must be YYYY-MM')

    await ensureTables()

    const entries = await query<BSEntry>(
      `SELECT * FROM BSEntry WHERE storeId = ? AND period = ? ORDER BY createdAt ASC`,
      [storeId, period]
    )
    return ok(entries)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/bs-entries — upsert (replace) entry for accountId + period
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const body = await req.json() as any
    const { accountId, amount, period } = body

    if (!accountId) return err('accountId required')
    if (amount === undefined || amount === null) return err('amount required')
    if (!period) return err('period required (YYYY-MM)')
    if (!/^\d{4}-\d{2}$/.test(period)) return err('period must be YYYY-MM')

    await ensureTables()

    // Check if entry already exists for this account+period → update
    const existing = await query<BSEntry>(
      `SELECT id FROM BSEntry WHERE storeId = ? AND accountId = ? AND period = ?`,
      [storeId, accountId, period]
    )

    if (existing[0]) {
      await query(
        `UPDATE BSEntry SET amount = ? WHERE id = ?`,
        [Number(amount), existing[0].id]
      )
      const updated = await query<BSEntry>(`SELECT * FROM BSEntry WHERE id = ?`, [existing[0].id])
      return ok(updated[0])
    }

    const id = newId()
    const createdAt = nowISO()
    await query(
      `INSERT INTO BSEntry (id, storeId, accountId, amount, period, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, storeId, accountId, Number(amount), period, createdAt]
    )

    const entry = await query<BSEntry>(`SELECT * FROM BSEntry WHERE id = ?`, [id])
    return ok(entry[0] ?? { id }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
