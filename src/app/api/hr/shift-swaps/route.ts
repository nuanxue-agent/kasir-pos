import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ShiftSwap (
    id TEXT PRIMARY KEY,
    requesterId TEXT NOT NULL,
    targetId TEXT NOT NULL,
    shiftId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
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
      `SELECT ss.*,
        er.name as requesterName,
        et.name as targetName
       FROM ShiftSwap ss
       LEFT JOIN Employee er ON er.id = ss.requesterId
       LEFT JOIN Employee et ON et.id = ss.targetId
       WHERE ss.storeId = ?
       ORDER BY ss.createdAt DESC`,
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
    const body = await req.json() as { storeId?: string; shiftId?: string; targetId?: string; requesterId?: string }
    const { storeId, shiftId, targetId, requesterId } = body
    if (!storeId || !shiftId || !targetId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Resolve requesterId from shift if not provided
    let resolvedRequesterId = requesterId
    if (!resolvedRequesterId) {
      const rows = await query('SELECT employeeId FROM Shift WHERE id = ?', [shiftId])
      resolvedRequesterId = rows[0]?.employeeId
    }
    if (!resolvedRequesterId) return NextResponse.json({ error: 'Could not resolve requesterId' }, { status: 400 })
    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ShiftSwap (id, requesterId, targetId, shiftId, storeId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, resolvedRequesterId, targetId, shiftId, storeId, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
