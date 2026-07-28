import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ShiftTemplate (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    dayOfWeek INTEGER NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CASHIER',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const rows = await query(
      `SELECT * FROM ShiftTemplate WHERE storeId = ? ORDER BY dayOfWeek, startTime`,
      [storeId]
    )
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as {
      storeId?: string; name?: string; dayOfWeek?: number
      startTime?: string; endTime?: string; role?: string
    }
    const { storeId, name, dayOfWeek, startTime, endTime, role = 'CASHIER' } = body
    if (!storeId || !name || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 })
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ShiftTemplate (id, storeId, name, dayOfWeek, startTime, endTime, role, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, name, dayOfWeek, startTime, endTime, role, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await exec(`DELETE FROM ShiftTemplate WHERE id = ?`, [id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
