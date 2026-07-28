// GET  /api/auto-mod-rules?storeId=
// POST /api/auto-mod-rules — create a new auto-mod keyword rule
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReviewModerationTables } from '../review-moderation/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_RULE_ACTIONS = ['FLAG', 'REJECT']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReviewModerationTables()

  const rows = await query(
    `SELECT * FROM AutoModRule WHERE storeId = ? ORDER BY action ASC, keyword ASC`,
    [storeId],
  )

  const rules = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
  }))

  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const { keyword, action = 'FLAG', active = true } = b

  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return err("'keyword' is required", 400, 'MISSING_FIELD')
  }
  if (!VALID_RULE_ACTIONS.includes(action)) {
    return err("action must be FLAG or REJECT", 400, 'INVALID_FIELD')
  }

  await ensureReviewModerationTables()

  // Prevent duplicate keywords per store
  const existing = await query(
    `SELECT id FROM AutoModRule WHERE storeId = ? AND keyword = ?`,
    [storeId, keyword.trim().toLowerCase()],
  )
  if ((existing as any[]).length > 0) {
    return err('A rule with this keyword already exists', 409, 'DUPLICATE')
  }

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO AutoModRule (id, storeId, keyword, action, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, keyword.trim().toLowerCase(), action, active ? 1 : 0, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const ruleId  = sp.get('id') ?? ''
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')
  if (!ruleId)  return err('id required', 400, 'MISSING_FIELD')

  await ensureReviewModerationTables()

  const rows = await query(
    `SELECT id FROM AutoModRule WHERE id = ? AND storeId = ?`,
    [ruleId, storeId],
  )
  if ((rows as any[]).length === 0) return err('Rule not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const sets: string[]  = []
  const vals: unknown[] = []

  if (b.keyword !== undefined) { sets.push('keyword = ?'); vals.push(b.keyword.trim().toLowerCase()) }
  if (b.action  !== undefined) {
    if (!VALID_RULE_ACTIONS.includes(b.action)) return err('action must be FLAG or REJECT', 400, 'INVALID_FIELD')
    sets.push('action = ?'); vals.push(b.action)
  }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }
  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(ruleId)
  await exec(`UPDATE AutoModRule SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
