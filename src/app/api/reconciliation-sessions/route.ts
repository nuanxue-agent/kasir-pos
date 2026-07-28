// GET/POST /api/reconciliation-sessions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBankAccountTables } from '../bank-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/reconciliation-sessions?storeId=xxx&accountId=xxx&status=OPEN|COMPLETED
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureBankAccountTables()

    const conditions: string[] = ['storeId = ?']
    const vals: any[] = [storeId]

    const accountId = sp.get('accountId')
    if (accountId) { conditions.push('accountId = ?'); vals.push(accountId) }

    const status = sp.get('status')
    if (status) { conditions.push('status = ?'); vals.push(status) }

    const rows = await query(
      `SELECT * FROM ReconciliationSession WHERE ${conditions.join(' AND ')} ORDER BY createdAt DESC`,
      vals,
    )

    const sessions = (rows as any[]).map(r => ({
      ...r,
      openingBalance: Number(r.openingBalance),
      closingBalance: Number(r.closingBalance),
    }))

    return ok(sessions)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/reconciliation-sessions?storeId=xxx
// Body: { accountId, period, openingBalance, closingBalance? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureBankAccountTables()

    const b = (await req.json()) as any
    if (!b.accountId) return err("Field 'accountId' is required")
    if (!b.period) return err("Field 'period' is required")

    const t = nowISO()
    const id = newId()
    const openingBalance = Number(b.openingBalance ?? 0)
    const closingBalance = Number(b.closingBalance ?? 0)
    const status = b.status === 'COMPLETED' ? 'COMPLETED' : 'OPEN'
    const completedAt = status === 'COMPLETED' ? t : null

    await exec(
      `INSERT INTO ReconciliationSession (id, accountId, storeId, period, openingBalance, closingBalance, status, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, b.accountId, storeId, b.period, openingBalance, closingBalance, status, completedAt, t, t],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
