import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { validatePushSubscription } from '@/lib/push-notifications'

// Lazy-init the PushSubscription table
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS PushSubscription (
      id          TEXT PRIMARY KEY,
      userId      TEXT NOT NULL,
      storeId     TEXT,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { subscription, storeId } = body as {
      subscription: unknown
      storeId?: string
    }

    if (!validatePushSubscription(subscription)) {
      return NextResponse.json({ error: 'Invalid push subscription payload' }, { status: 400 })
    }

    await ensureTable()

    const id = `push_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const userId = (session.user as any).id as string

    // Upsert: update keys if endpoint already exists for this user
    await query(
      `INSERT INTO PushSubscription (id, userId, storeId, endpoint, p256dh, auth, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh    = excluded.p256dh,
         auth      = excluded.auth,
         userId    = excluded.userId,
         updatedAt = datetime('now')`,
      [
        id,
        userId,
        storeId ?? null,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
      ],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push-subscribe]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { endpoint } = (await req.json()) as { endpoint?: string }
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
    }

    await ensureTable()
    const userId = (session.user as any).id as string

    await query(`DELETE FROM PushSubscription WHERE endpoint = ? AND userId = ?`, [
      endpoint,
      userId,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push-unsubscribe]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
