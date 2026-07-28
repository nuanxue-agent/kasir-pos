import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { validateQuestions, type SurveyStatus, type SurveyType } from '@/lib/surveys'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureSurveyTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Survey (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT 'SATISFACTION',
    questions   TEXT NOT NULL DEFAULT '[]',
    startDate   TEXT NOT NULL,
    endDate     TEXT NOT NULL,
    anonymous   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS SurveyResponse (
    id          TEXT PRIMARY KEY,
    surveyId    TEXT NOT NULL,
    employeeId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    answers     TEXT NOT NULL DEFAULT '[]',
    submittedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureSurveyTables()

  const status = sp.get('status') as SurveyStatus | null
  const type   = sp.get('type') as SurveyType | null

  let sql = `SELECT * FROM Survey WHERE storeId = ?`
  const params: any[] = [storeId]

  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (type)   { sql += ' AND type = ?';   params.push(type) }
  sql += ' ORDER BY createdAt DESC'

  const rows = (await query(sql, params)) as any[]
  const surveys = rows.map(r => ({
    ...r,
    anonymous: Boolean(r.anonymous),
    questions: JSON.parse(r.questions || '[]'),
  }))

  return NextResponse.json({ data: surveys })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureSurveyTables()

  const b = (await req.json()) as any
  if (!b.title?.trim()) return err('title is required')
  if (!b.startDate)     return err('startDate is required')
  if (!b.endDate)       return err('endDate is required')
  if (b.endDate <= b.startDate) return err('endDate must be after startDate')

  const VALID_TYPES: SurveyType[] = ['SATISFACTION', 'PULSE', 'EXIT', 'ONBOARDING']
  const type: SurveyType = b.type ?? 'SATISFACTION'
  if (!VALID_TYPES.includes(type)) return err(`Invalid type: ${type}`)

  const questions = b.questions ?? []
  const qErr = validateQuestions(questions)
  if (qErr) return err(qErr)

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Survey (id, storeId, title, description, type, questions, startDate, endDate, anonymous, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
    [id, storeId, b.title.trim(), b.description ?? '', type, JSON.stringify(questions),
     b.startDate, b.endDate, b.anonymous ? 1 : 0, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
