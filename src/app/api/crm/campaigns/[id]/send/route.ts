// POST /api/crm/campaigns/:id/send
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CrmCampaign (id TEXT PRIMARY KEY, storeId TEXT NOT NULL, segmentId TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'NOTIFICATION', value TEXT, scheduledAt TEXT, sentAt TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', createdAt TEXT NOT NULL)`)
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

  const campaign = await queryOne<any>('SELECT * FROM CrmCampaign WHERE id = ?', [id])
  if (!campaign || !storeIds.includes(campaign.storeId)) return err('Campaign not found', 404)
  if (campaign.status === 'SENT') return err('Campaign already sent', 409)

  // Fetch audience members
  const members = await query<any>(
    'SELECT sm.customerId FROM SegmentMember sm WHERE sm.segmentId = ?',
    [campaign.segmentId],
  )

  const now = nowISO()
  await exec(
    'UPDATE CrmCampaign SET status = ?, sentAt = ? WHERE id = ?',
    ['SENT', now, id],
  )

  return NextResponse.json({
    campaignId: id,
    status: 'SENT',
    sentAt: now,
    audienceSize: members.length,
    type: campaign.type,
    value: campaign.value,
  })
}
