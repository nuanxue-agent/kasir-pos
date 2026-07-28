// POST /api/subscriptions/process — generate due invoices for active subscriptions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureSubscriptionTables } from '@/app/api/subscriptions/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureInvoiceTables() {
  await ensureSubscriptionTables()
  await exec(`CREATE TABLE IF NOT EXISTS SubscriptionInvoice (
    id             TEXT PRIMARY KEY,
    subscriptionId TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    amount         REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'PENDING',
    dueDate        TEXT NOT NULL,
    paidAt         TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureInvoiceTables()

  const today = new Date().toISOString().slice(0, 10)

  // Find active subscriptions with billing due today or overdue
  const due = (await query(
    `SELECT cs.*, mp.price, mp.billingCycle, mp.durationDays
     FROM CustomerSubscription cs
     JOIN MembershipPlan mp ON cs.planId = mp.id
     WHERE cs.storeId = ? AND cs.status = 'ACTIVE' AND cs.autoRenew = 1
       AND cs.nextBillingAt <= ?`,
    [storeId, today],
  )) as any[]

  // Avoid duplicate PENDING invoices for the same sub+dueDate
  const existingRows = (await query(
    `SELECT subscriptionId, dueDate FROM SubscriptionInvoice
     WHERE storeId = ? AND status = 'PENDING'`,
    [storeId],
  )) as any[]
  const existingKey = new Set(existingRows.map((r: any) => `${r.subscriptionId}:${r.dueDate}`))

  let generated = 0
  const t = nowISO()

  for (const sub of due) {
    const dueDate = sub.nextBillingAt
    const key = `${sub.id}:${dueDate}`
    if (existingKey.has(key)) continue

    // Create PENDING invoice
    const invoiceId = newId()
    await exec(
      `INSERT INTO SubscriptionInvoice
       (id, subscriptionId, storeId, amount, status, dueDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [invoiceId, sub.id, storeId, sub.price, dueDate, t, t],
    )

    // Advance nextBillingAt
    const d = new Date(sub.nextBillingAt)
    if (sub.billingCycle === 'MONTHLY') d.setMonth(d.getMonth() + 1)
    else if (sub.billingCycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
    else if (sub.billingCycle === 'ANNUAL') d.setFullYear(d.getFullYear() + 1)
    else d.setDate(d.getDate() + (sub.durationDays ?? 30))

    await exec(
      `UPDATE CustomerSubscription SET nextBillingAt = ?, updatedAt = ? WHERE id = ?`,
      [d.toISOString().slice(0, 10), t, sub.id],
    )

    generated++
  }

  return NextResponse.json({ generated, date: today })
}
