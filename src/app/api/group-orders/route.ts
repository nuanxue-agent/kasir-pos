import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

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

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = await req.json() as any
    const { storeId, tableNumber, hostName, items = [] } = body

    if (!storeId) return err('storeId required')
    if (!tableNumber) return err('tableNumber required')
    if (!hostName) return err('hostName required')

    await ensureTable()

    const id = newId()
    await exec(
      `INSERT INTO GroupOrder (id, storeId, tableNumber, hostName, items, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, storeId, tableNumber, hostName, JSON.stringify(items), nowISO()]
    )

    const rows = await query(`SELECT * FROM GroupOrder WHERE id = ?`, [id])
    const row = rows[0] as any
    return ok({ data: { ...row, items: JSON.parse(row.items ?? '[]') } }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
