// GET  /api/subscriptions/[id]/invoices
// POST /api/subscriptions/[id]/invoices
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const { id: subscriptionId } = await params
  await ensureInvoiceTables()

  const rows = await query(
    `SELECT * FROM SubscriptionInvoice
     WHERE subscriptionId = ? AND storeId = ?
     ORDER BY dueDate DESC`,
    [subscriptionId, storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const { id: subscriptionId } = await params
  await ensureInvoiceTables()

  const b = (await req.json()) as any
  if (!b.amount) return err("Field 'amount' is required", 400)
  if (!b.dueDate) return err("Field 'dueDate' is required", 400)

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO SubscriptionInvoice
     (id, subscriptionId, storeId, amount, status, dueDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, subscriptionId, storeId, b.amount, b.status ?? 'PENDING', b.dueDate, t, t],
  )

  // If marking as paid, record paidAt
  if (b.status === 'PAID' && b.paidAt) {
    await exec(`UPDATE SubscriptionInvoice SET paidAt = ? WHERE id = ?`, [b.paidAt, id])
  }

  return NextResponse.json({ id }, { status: 201 })
}
