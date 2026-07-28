// POST /api/birthday-automations/process?storeId=
// Finds all PENDING queue entries due today and marks them SENT
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBirthdayTables } from '../route'
import { calcTriggerDate, isValidQueueTransition } from '@/lib/birthday-automation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBirthdayTables()

  const today = new Date().toISOString().slice(0, 10)
  const now = nowISO()

  // 1. Enqueue: for each active automation, find customers whose trigger date = today
  const automations = await query(
    `SELECT * FROM BirthdayAutomation WHERE storeId = ? AND active = 1`,
    [storeId],
  )

  let enqueued = 0
  for (const auto of automations as any[]) {
    const triggerType: string = auto.triggerType

    const dateCol =
      triggerType === 'BIRTHDAY'
        ? 'birthday'
        : triggerType === 'ANNIVERSARY'
        ? 'anniversaryDate'
        : 'signupDate'

    const customers = await query(
      `SELECT id, ${dateCol} as eventDate FROM Customer WHERE storeId = ? AND ${dateCol} IS NOT NULL`,
      [storeId],
    ).catch(() => [] as any[])

    const year = new Date().getFullYear()

    for (const c of customers as any[]) {
      if (!c.eventDate) continue
      const triggerDate = calcTriggerDate(c.eventDate, Number(auto.daysBeforeTrigger), year)
      if (triggerDate !== today) continue

      // Skip if already queued today for this automation+customer
      const existing = await query(
        `SELECT id FROM BirthdayQueue WHERE storeId = ? AND automationId = ? AND customerId = ? AND scheduledDate = ?`,
        [storeId, auto.id, c.id, today],
      )
      if ((existing as any[]).length > 0) continue

      const qid = newId()
      await exec(
        `INSERT INTO BirthdayQueue (id, customerId, storeId, automationId, scheduledDate, status, sentAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, ?, ?)`,
        [qid, c.id, storeId, auto.id, today, now, now],
      )
      enqueued++
    }
  }

  // 2. Process: send all PENDING entries scheduled for today
  const pendingRows = await query(
    `SELECT * FROM BirthdayQueue WHERE storeId = ? AND scheduledDate = ? AND status = 'PENDING'`,
    [storeId, today],
  )

  let sent = 0
  let failed = 0

  for (const row of pendingRows as any[]) {
    if (!isValidQueueTransition('PENDING', 'SENT')) continue
    try {
      // In production: send SMS/email/push notification here
      await exec(
        `UPDATE BirthdayQueue SET status = 'SENT', sentAt = ?, updatedAt = ? WHERE id = ?`,
        [now, now, row.id],
      )
      sent++
    } catch {
      await exec(
        `UPDATE BirthdayQueue SET status = 'FAILED', updatedAt = ? WHERE id = ?`,
        [now, row.id],
      )
      failed++
    }
  }

  return NextResponse.json({ ok: true, enqueued, sent, failed, date: today })
}
