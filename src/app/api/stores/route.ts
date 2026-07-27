import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'
import { checkStoreLimit, type Plan } from '@/lib/plan'

function ok(data: any, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/stores — return all stores for the authenticated user
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    // Return stores already attached to session for speed; fall back to DB query
    if (user.stores?.length) return ok(user.stores)

    const tenantId = user.tenantId ?? user.id
    const stores = await query(
      `SELECT id, name, address, phone, email, taxRate, currency, timezone, modules, createdAt
       FROM Store WHERE tenantId=? ORDER BY createdAt ASC`,
      [tenantId]
    )
    return ok(stores)
  } catch (e: any) {
    console.error('GET /api/stores error:', e)
    return err('Internal server error', 500)
  }
}

// POST /api/stores — create a new store for the authenticated tenant
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const tenantId = user.tenantId ?? user.id
    if (!tenantId) return err('Tenant not found', 400)

    const b: any = await req.json()
    if (!b.name || String(b.name).trim().length < 2) return err('name must be at least 2 characters')

    // ── Plan limit: check store count ──────────────────────────────────────
    const tenantPlan = (user.plan ?? 'FREE') as Plan
    const [countRow] = await query(
      `SELECT COUNT(*) as cnt FROM Store WHERE tenantId = ?`,
      [tenantId],
    ) as any[]
    const storeCount = Number(countRow?.cnt ?? 0)
    if (!checkStoreLimit(tenantPlan, storeCount)) {
      return NextResponse.json(
        { error: 'Plan limit reached', upgrade: true },
        { status: 403 },
      )
    }

    const id = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO Store (id, tenantId, name, address, phone, email, taxRate, currency, timezone, receiptNote, modules, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        String(b.name).trim(),
        b.address ?? null,
        b.phone ?? null,
        b.email ?? null,
        Number(b.taxRate ?? 0),
        b.currency ?? 'IDR',
        b.timezone ?? 'Asia/Jakarta',
        b.receiptNote ?? null,
        b.modules ?? null,
        t,
        t,
      ]
    )

    const store = await queryOne(`SELECT * FROM Store WHERE id=?`, [id])
    return ok(store, 201)
  } catch (e: any) {
    console.error('POST /api/stores error:', e)
    return err('Internal server error', 500)
  }
}
