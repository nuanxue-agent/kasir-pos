// GET /api/audit-logs?storeId=&userId=&action=&resourceType=&from=&to=&page=&pageSize=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { ensureAuditTable } from '@/lib/audit-query'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId      = searchParams.get('storeId') ?? ''
  const userId       = searchParams.get('userId') ?? ''
  const action       = searchParams.get('action') ?? ''
  const resourceType = searchParams.get('resourceType') ?? ''
  const from         = searchParams.get('from') ?? ''
  const to           = searchParams.get('to') ?? ''
  const page         = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize     = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  await ensureAuditTable()

  try {
    const whereClauses = ['al.storeId = ?']
    const whereParams: unknown[] = [storeId]

    if (userId) {
      whereClauses.push('al.userId = ?')
      whereParams.push(userId)
    }
    if (action) {
      whereClauses.push('al.action = ?')
      whereParams.push(action)
    }
    if (resourceType) {
      whereClauses.push('al.resourceType = ?')
      whereParams.push(resourceType)
    }
    if (from) {
      whereClauses.push('al.createdAt >= ?')
      whereParams.push(from)
    }
    if (to) {
      whereClauses.push('al.createdAt <= ?')
      whereParams.push(to + 'T23:59:59.999Z')
    }

    const where = whereClauses.join(' AND ')
    const offset = (page - 1) * pageSize

    const [countRows, rows] = await Promise.all([
      queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM AuditLog al WHERE ${where}`,
        whereParams,
      ),
      query<any>(
        `SELECT al.*, u.name as userName
         FROM AuditLog al
         LEFT JOIN User u ON al.userId = u.id
         WHERE ${where}
         ORDER BY al.createdAt DESC
         LIMIT ? OFFSET ?`,
        [...whereParams, pageSize, offset],
      ),
    ])

    const total = (countRows as any)?.total ?? 0
    const pages = Math.max(1, Math.ceil(total / pageSize))

    const entries = rows.map((r: any) => ({
      ...r,
      meta: r.meta
        ? (() => { try { return JSON.parse(r.meta) } catch { return null } })()
        : null,
    }))

    return ok({ entries, total, page, pages, pageSize })
  } catch (e: any) {
    console.error('[audit-logs] GET error:', e)
    return err(`Failed to fetch audit logs: ${e.message}`, 500)
  }
}
