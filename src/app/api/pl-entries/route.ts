// GET/POST /api/pl-entries
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables, PLAccount } from '../pl-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface PLEntry {
  id: string
  storeId: string
  accountId: string
  amount: number
  period: string      // YYYY-MM
  description: string
  createdAt: string
}

// GET /api/pl-entries?storeId=xxx&period=2025-01&accountId=xxx
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

    await ensureTables()

    const period = url.searchParams.get('period')
    const accountId = url.searchParams.get('accountId')

    let sql = `SELECT e.*, a.code, a.name as accountName, a.category
               FROM PLEntry e
               JOIN PLAccount a ON a.id = e.accountId
               WHERE e.storeId = ?`
    const params: unknown[] = [storeId]

    if (period) { sql += ` AND e.period = ?`; params.push(period) }
    if (accountId) { sql += ` AND e.accountId = ?`; params.push(accountId) }
    sql += ` ORDER BY e.createdAt DESC`

    const rows = await query<PLEntry>(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/pl-entries?storeId=xxx
// Body: { accountId, amount, period, description? }
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

    await ensureTables()

    const body = await req.json() as any

    if (!body.accountId) return err('accountId required')
    if (body.amount == null) return err('amount required')
    if (!body.period) return err('period required')

    // Validate period format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(body.period)) return err('period must be YYYY-MM')

    // Verify account belongs to store
    const accounts = await query<PLAccount>(
      `SELECT id FROM PLAccount WHERE id = ? AND storeId = ?`,
      [body.accountId, storeId]
    )
    if ((accounts as any[]).length === 0) return err('Account not found')

    const amount = Number(body.amount)
    if (isNaN(amount)) return err('amount must be a number')

    const description = String(body.description ?? '').trim()
    const now = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO PLEntry (id, storeId, accountId, amount, period, description, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, body.accountId, amount, body.period, description, now]
    )

    return ok({ id, storeId, accountId: body.accountId, amount, period: body.period, description, createdAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
