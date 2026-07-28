// GET /api/crm/segments?storeId=xxx
// POST /api/crm/segments
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerSegment (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      rules TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS SegmentMember (
      id TEXT PRIMARY KEY,
      segmentId TEXT NOT NULL,
      customerId TEXT NOT NULL,
      addedAt TEXT NOT NULL,
      UNIQUE(segmentId, customerId)
    )
  `)
}

const ruleSchema = z.object({
  field: z.enum(['recency', 'frequency', 'monetary', 'rfmSegment']),
  operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq']),
  value: z.union([z.number(), z.string()]),
})

const postSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  rules: z.array(ruleSchema).min(1),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const storeId = req.nextUrl.searchParams.get('storeId') ?? ''
  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTables()

  const rows = await query<any>(
    'SELECT id, storeId, name, description, rules, createdAt FROM CustomerSegment WHERE storeId = ? ORDER BY createdAt DESC',
    [storeId],
  )

  const segments = await Promise.all(rows.map(async (r) => {
    const [countRow] = await query<any>(
      'SELECT COUNT(*) as cnt FROM SegmentMember WHERE segmentId = ?',
      [r.id],
    )
    return {
      ...r,
      rules: (() => { try { return JSON.parse(r.rules) } catch { return [] } })(),
      memberCount: countRow?.cnt ?? 0,
    }
  }))

  return NextResponse.json(segments)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const body = await req.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message)

  const { storeId, name, description, rules } = parsed.data
  if (!storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTables()

  const id = newId()
  const now = nowISO()

  await exec(
    'INSERT INTO CustomerSegment (id, storeId, name, description, rules, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, storeId, name, description ?? '', JSON.stringify(rules), now],
  )

  return NextResponse.json({ id, storeId, name, description, rules, createdAt: now, memberCount: 0 }, { status: 201 })
}
