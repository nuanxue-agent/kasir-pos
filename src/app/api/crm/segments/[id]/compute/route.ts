// POST /api/crm/segments/:id/compute
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'
import { computeRFM, type RawCustomerStat } from '@/lib/rfm'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'

export interface SegmentRule {
  field: 'recency' | 'frequency' | 'monetary' | 'rfmSegment'
  operator: Operator
  value: number | string
}

export function evaluateRule(rule: SegmentRule, customer: RawCustomerStat & { rfmSegment?: string }): boolean {
  const { field, operator, value } = rule
  const raw = field === 'rfmSegment' ? customer.rfmSegment : customer[field as keyof RawCustomerStat]
  if (raw === undefined || raw === null) return false
  if (typeof raw === 'string') {
    if (operator === 'eq') return raw === String(value)
    if (operator === 'neq') return raw !== String(value)
    return false
  }
  const numVal = Number(value)
  const numRaw = Number(raw)
  switch (operator) {
    case 'gt':  return numRaw > numVal
    case 'lt':  return numRaw < numVal
    case 'gte': return numRaw >= numVal
    case 'lte': return numRaw <= numVal
    case 'eq':  return numRaw === numVal
    case 'neq': return numRaw !== numVal
    default:    return false
  }
}

export function evaluateRules(rules: SegmentRule[], customer: RawCustomerStat & { rfmSegment?: string }): boolean {
  return rules.every((r) => evaluateRule(r, customer))
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CustomerSegment (id TEXT PRIMARY KEY, storeId TEXT NOT NULL, name TEXT NOT NULL, description TEXT, rules TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL)`)
  await exec(`CREATE TABLE IF NOT EXISTS SegmentMember (id TEXT PRIMARY KEY, segmentId TEXT NOT NULL, customerId TEXT NOT NULL, addedAt TEXT NOT NULL, UNIQUE(segmentId, customerId))`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params
  await ensureTables()

  const segment = await queryOne<any>('SELECT * FROM CustomerSegment WHERE id = ?', [id])
  if (!segment || !storeIds.includes(segment.storeId)) return err('Segment not found', 404)

  const rules: SegmentRule[] = (() => { try { return JSON.parse(segment.rules) } catch { return [] } })()

  const rawStats = await query<RawCustomerStat>(
    `SELECT c.id, c.name, c.phone, c.email,
      COALESCE(CAST(julianday('now') - julianday(MAX(o.createdAt)) AS INTEGER), 9999) AS recency,
      COUNT(o.id) AS frequency,
      COALESCE(SUM(o.total), 0) AS monetary
    FROM Customer c
    LEFT JOIN "Order" o ON o.customerId = c.id AND o.storeId = ? AND o.status = 'COMPLETED'
    WHERE c.storeId = ?
    GROUP BY c.id`,
    [segment.storeId, segment.storeId],
  )

  const rfmCustomers = computeRFM(rawStats)
  const rfmMap = new Map(rfmCustomers.map((c) => [c.id, c.segment]))

  const now = nowISO()
  await exec('DELETE FROM SegmentMember WHERE segmentId = ?', [id])

  let matched = 0
  for (const stat of rawStats) {
    const withSegment = { ...stat, rfmSegment: rfmMap.get(stat.id) }
    if (evaluateRules(rules, withSegment)) {
      await exec(
        'INSERT OR IGNORE INTO SegmentMember (id, segmentId, customerId, addedAt) VALUES (?, ?, ?, ?)',
        [newId(), id, stat.id, now],
      )
      matched++
    }
  }

  return NextResponse.json({ segmentId: id, matched, computedAt: now })
}
