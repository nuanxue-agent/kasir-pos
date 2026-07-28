// GET /api/crm/campaigns?storeId=xxx
// POST /api/crm/campaigns
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CustomerSegment (id TEXT PRIMARY KEY, storeId TEXT NOT NULL, name TEXT NOT NULL, description TEXT, rules TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL)`)
  await exec(`CREATE TABLE IF NOT EXISTS SegmentMember (id TEXT PRIMARY KEY, segmentId TEXT NOT NULL, customerId TEXT NOT NULL, addedAt TEXT NOT NULL, UNIQUE(segmentId, customerId))`)
  await exec(`CREATE TABLE IF NOT EXISTS CrmCampaign (id TEXT PRIMARY KEY, storeId TEXT NOT NULL, segmentId TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'NOTIFICATION', value TEXT, scheduledAt TEXT, sentAt TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', createdAt TEXT NOT NULL)`)
}

const postSchema = z.object({
  storeId: z.string().min(1),
  segmentId: z.string().min(1),
  name: z.string().min(1).max(100),
  type: z.enum(['DISCOUNT', 'POINTS', 'NOTIFICATION']),
  value: z.string().optional(),
  scheduledAt: z.string().optional(),
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
    `SELECT c.*, s.name as segmentName,
      (SELECT COUNT(*) FROM SegmentMember sm WHERE sm.segmentId = c.segmentId) as audienceSize
    FROM CrmCampaign c
    LEFT JOIN CustomerSegment s ON s.id = c.segmentId
    WHERE c.storeId = ?
    ORDER BY c.createdAt DESC`,
    [storeId],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const body = await req.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message)

  const { storeId, segmentId, name, type, value, scheduledAt } = parsed.data
  if (!storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTables()

  const id = newId()
  const now = nowISO()
  const status = scheduledAt ? 'SCHEDULED' : 'DRAFT'

  await exec(
    'INSERT INTO CrmCampaign (id, storeId, segmentId, name, type, value, scheduledAt, sentAt, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)',
    [id, storeId, segmentId, name, type, value ?? null, scheduledAt ?? null, status, now],
  )

  return NextResponse.json({ id, storeId, segmentId, name, type, value, scheduledAt, status, createdAt: now }, { status: 201 })
}
