// GET/POST /api/bank-statements
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBankAccountTables } from '../bank-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/bank-statements?storeId=xxx&accountId=xxx&from=xxx&to=xxx&reconciled=0|1
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

    const from = sp.get('from')
    if (from) { conditions.push('date >= ?'); vals.push(from) }

    const to = sp.get('to')
    if (to) { conditions.push('date <= ?'); vals.push(to) }

    const reconciled = sp.get('reconciled')
    if (reconciled !== null) { conditions.push('reconciled = ?'); vals.push(reconciled === '1' ? 1 : 0) }

    const rows = await query(
      `SELECT * FROM BankStatement WHERE ${conditions.join(' AND ')} ORDER BY date DESC, createdAt DESC`,
      vals,
    )

    const statements = (rows as any[]).map(r => ({
      ...r,
      amount: Number(r.amount),
      reconciled: Boolean(r.reconciled),
    }))

    return ok(statements)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/bank-statements?storeId=xxx
// Body: { accountId, date, description, amount, type, reference? }
// OR:   { accountId, rows: ImportedRow[] }  (bulk import)
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

    const t = nowISO()

    // Bulk import path
    if (Array.isArray(b.rows)) {
      const ids: string[] = []
      for (const row of b.rows as any[]) {
        const rawType = (row.type ?? '').toUpperCase()
        if (rawType !== 'CREDIT' && rawType !== 'DEBIT') continue
        const amount = Number(row.amount)
        if (isNaN(amount) || amount === 0) continue
        const id = newId()
        ids.push(id)
        await exec(
          `INSERT INTO BankStatement (id, accountId, storeId, date, description, amount, type, reference, reconciled, matchedTransactionId, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
          [id, b.accountId, storeId, row.date ?? t.slice(0, 10), row.description ?? '', Math.abs(amount), rawType, row.reference ?? null, t],
        )
      }
      return ok({ inserted: ids.length }, 201)
    }

    // Single row path
    if (!b.date) return err("Field 'date' is required")
    if (!b.description) return err("Field 'description' is required")
    const rawType = (b.type ?? '').toUpperCase()
    if (rawType !== 'CREDIT' && rawType !== 'DEBIT') return err("'type' must be CREDIT or DEBIT")

    const id = newId()
    await exec(
      `INSERT INTO BankStatement (id, accountId, storeId, date, description, amount, type, reference, reconciled, matchedTransactionId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
      [id, b.accountId, storeId, b.date, b.description, Math.abs(Number(b.amount ?? 0)), rawType, b.reference ?? null, t],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
