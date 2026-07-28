import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureNPSTables() {
  await exec(`CREATE TABLE IF NOT EXISTS NPSSurvey (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    question    TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    triggerType TEXT NOT NULL DEFAULT 'POST_PURCHASE',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS NPSResponse (
    id          TEXT PRIMARY KEY,
    surveyId    TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    customerId  TEXT,
    score       INTEGER NOT NULL,
    comment     TEXT,
    channel     TEXT NOT NULL DEFAULT 'IN_APP',
    respondedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureNPSTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const active = searchParams.get('active')
    const triggerType = searchParams.get('triggerType')

    let sql = `SELECT * FROM NPSSurvey WHERE storeId = ?`
    const params: any[] = [storeId]

    if (active !== null) { sql += ' AND active = ?'; params.push(Number(active)) }
    if (triggerType)     { sql += ' AND triggerType = ?'; params.push(triggerType) }
    sql += ' ORDER BY createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureNPSTables()
    const body = await req.json() as any
    const {
      storeId, name, question,
      active = 1,
      triggerType = 'POST_PURCHASE',
    } = body

    if (!storeId || !name || !question) {
      return err('storeId, name, question required')
    }

    const VALID_TRIGGERS = ['POST_PURCHASE', 'MANUAL', 'SCHEDULED']
    if (!VALID_TRIGGERS.includes(triggerType)) {
      return err(`triggerType must be one of: ${VALID_TRIGGERS.join(', ')}`)
    }

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO NPSSurvey (id, storeId, name, question, active, triggerType, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, name, question, active ? 1 : 0, triggerType, now, now],
    )

    const [row] = await query(`SELECT * FROM NPSSurvey WHERE id = ?`, [id])
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
