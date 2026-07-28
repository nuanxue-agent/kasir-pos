// GET  /api/import-jobs?storeId=  — list import jobs for a store
// POST /api/import-jobs           — create a new import/export job
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const JOB_TYPES = ['IMPORT', 'EXPORT'] as const
const JOB_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const
type JobType = (typeof JOB_TYPES)[number]

async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ImportJob (
      id            TEXT PRIMARY KEY,
      storeId       TEXT NOT NULL,
      filename      TEXT NOT NULL DEFAULT '',
      type          TEXT NOT NULL DEFAULT 'IMPORT',
      status        TEXT NOT NULL DEFAULT 'PENDING',
      totalRows     INTEGER NOT NULL DEFAULT 0,
      processedRows INTEGER NOT NULL DEFAULT 0,
      errorCount    INTEGER NOT NULL DEFAULT 0,
      errorLog      TEXT NOT NULL DEFAULT '[]',
      createdAt     TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10), 200)
  const jobs = await query(
    `SELECT id, storeId, filename, type, status, totalRows, processedRows, errorCount, createdAt
     FROM ImportJob
     WHERE storeId = ?
     ORDER BY createdAt DESC
     LIMIT ?`,
    [storeId, limit],
  )

  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const b = (await req.json()) as any

  const type: JobType = JOB_TYPES.includes(b.type) ? b.type : 'IMPORT'
  const filename: string = (b.filename ?? '').trim()
  const totalRows: number = Math.max(0, parseInt(b.totalRows ?? '0', 10) || 0)

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO ImportJob (id, storeId, filename, type, status, totalRows, processedRows, errorCount, errorLog, createdAt)
     VALUES (?, ?, ?, ?, 'PENDING', ?, 0, 0, '[]', ?)`,
    [id, storeId, filename, type, totalRows, now],
  )

  return NextResponse.json({ id, status: 'PENDING', createdAt: now }, { status: 201 })
}
