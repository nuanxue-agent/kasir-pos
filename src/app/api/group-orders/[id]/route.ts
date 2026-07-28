import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS GroupOrder (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    tableNumber TEXT NOT NULL,
    hostName TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'OPEN',
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const { id } = await params

    await ensureTable()

    const rows = await query(`SELECT * FROM GroupOrder WHERE id = ?`, [id])
    if (!rows.length) return err('Not found', 404)
    const row = rows[0] as any
    return ok({ data: { ...row, items: JSON.parse(row.items ?? '[]') } })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const { id } = await params

    await ensureTable()

    const existing = await query(`SELECT * FROM GroupOrder WHERE id = ?`, [id])
    if (!existing.length) return err('Not found', 404)

    const body = await req.json() as any
    const { status, items, hostName, tableNumber } = body

    if (status && !['OPEN', 'LOCKED', 'SUBMITTED'].includes(status))
      return err('status must be OPEN, LOCKED, or SUBMITTED')

    const row = existing[0] as any
    const newStatus = status ?? row.status
    const newItems = items !== undefined ? JSON.stringify(items) : row.items
    const newHostName = hostName ?? row.hostName
    const newTableNumber = tableNumber ?? row.tableNumber

    await exec(
      `UPDATE GroupOrder SET status = ?, items = ?, hostName = ?, tableNumber = ? WHERE id = ?`,
      [newStatus, newItems, newHostName, newTableNumber, id]
    )

    const updated = (await query(`SELECT * FROM GroupOrder WHERE id = ?`, [id]))[0] as any
    return ok({ data: { ...updated, items: JSON.parse(updated.items ?? '[]') } })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
