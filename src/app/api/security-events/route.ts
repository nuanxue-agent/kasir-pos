// GET/POST /api/security-events
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type SecurityEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'FAILED_LOGIN'
  | 'PERMISSION_DENIED'
  | 'VOID_TRANSACTION'
  | 'DISCOUNT_OVERRIDE'
  | 'PRICE_OVERRIDE'

export type SecurityEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

const VALID_TYPES = new Set<string>([
  'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PERMISSION_DENIED',
  'VOID_TRANSACTION', 'DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE',
])

const VALID_SEVERITIES = new Set<string>(['LOW', 'MEDIUM', 'HIGH'])

export async function ensureSecurityEventTables() {
  await exec(`CREATE TABLE IF NOT EXISTS SecurityEvent (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    userId      TEXT,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'LOW',
    description TEXT,
    createdAt   TEXT NOT NULL
  )`)
}

// GET /api/security-events?storeId=&userId=&type=&severity=&from=&to=&page=&pageSize=
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

    const role = (user.stores as any[])?.find((s: { id: string }) => s.id === storeId)?.role ?? ''
    if (!['OWNER', 'SUPERADMIN'].includes(role)) return err('Forbidden', 403)

    await ensureSecurityEventTables()

    const conditions: string[] = ['storeId = ?']
    const vals: any[] = [storeId]

    const userId = sp.get('userId')
    if (userId) { conditions.push('userId = ?'); vals.push(userId) }

    const type = sp.get('type')
    if (type) { conditions.push('type = ?'); vals.push(type) }

    const severity = sp.get('severity')
    if (severity) { conditions.push('severity = ?'); vals.push(severity) }

    const from = sp.get('from')
    if (from) { conditions.push('createdAt >= ?'); vals.push(from) }

    const to = sp.get('to')
    if (to) { conditions.push('createdAt <= ?'); vals.push(to + 'T23:59:59.999Z') }

    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(10, Number(sp.get('pageSize') ?? 50)))
    const offset = (page - 1) * pageSize

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await query(
      `SELECT COUNT(*) as total FROM SecurityEvent ${where}`,
      vals,
    )
    const total = Number((countRows as any[])[0]?.total ?? 0)

    const rows = await query(
      `SELECT * FROM SecurityEvent ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...vals, pageSize, offset],
    )

    return ok({
      items: rows as any[],
      total,
      page,
      pages: Math.ceil(total / pageSize),
      pageSize,
    })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/security-events
// Body: { storeId, userId?, type, severity?, description? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const b = (await req.json()) as any
    const storeId = b.storeId ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!b.type) return err("Field 'type' is required")
    if (!VALID_TYPES.has(b.type)) return err(`Invalid type: ${b.type}`)

    const severity: string = b.severity ?? 'LOW'
    if (!VALID_SEVERITIES.has(severity)) return err(`Invalid severity: ${severity}`)

    await ensureSecurityEventTables()

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO SecurityEvent (id, storeId, userId, type, severity, description, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.userId ?? null, b.type, severity, b.description ?? null, now],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
