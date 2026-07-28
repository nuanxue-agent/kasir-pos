// GET /api/nps-surveys?storeId=   POST /api/nps-surveys
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS NpsSurvey (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      question  TEXT NOT NULL,
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS NpsResponse (
      id         TEXT PRIMARY KEY,
      surveyId   TEXT NOT NULL,
      storeId    TEXT NOT NULL,
      customerId TEXT,
      orderId    TEXT,
      score      INTEGER NOT NULL,
      comment    TEXT,
      createdAt  TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureTables()

  const rows = await query(
    `SELECT s.*,
            COUNT(r.id) AS responseCount
     FROM NpsSurvey s
     LEFT JOIN NpsResponse r ON r.surveyId = s.id
     WHERE s.storeId = ?
     GROUP BY s.id
     ORDER BY s.createdAt DESC`,
    [storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const b = (await req.json()) as any
  if (!b.name?.trim()) return err('name required')
  if (!b.question?.trim()) return err('question required')

  await ensureTables()

  const id = newId()
  await exec(
    `INSERT INTO NpsSurvey (id, storeId, name, question, active, createdAt)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [id, storeId, b.name.trim(), b.question.trim(), nowISO()],
  )
  return NextResponse.json({ id, created: true }, { status: 201 })
}
