import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ReviewCycle (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    type TEXT NOT NULL DEFAULT 'QUARTERLY',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS PeerReview (
    id TEXT PRIMARY KEY,
    cycleId TEXT NOT NULL,
    reviewerId TEXT NOT NULL,
    revieweeId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    scores TEXT NOT NULL,
    comments TEXT,
    submittedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const rows = await query(
      `SELECT * FROM ReviewCycle WHERE storeId = ? ORDER BY createdAt DESC`,
      [storeId],
    )
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables()
    const body = (await req.json()) as {
      storeId?: string
      name?: string
      startDate?: string
      endDate?: string
      type?: string
    }
    const { storeId, name, startDate, endDate, type = 'QUARTERLY' } = body

    if (!storeId || !name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'storeId, name, startDate, endDate required' },
        { status: 400 },
      )
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ReviewCycle (id, storeId, name, startDate, endDate, status, type, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [id, storeId, name, startDate, endDate, type, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
