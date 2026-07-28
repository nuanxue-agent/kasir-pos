// GET /api/import-jobs/[id]  — retrieve job status and error log
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params

  await ensureTable()

  const job = await queryOne(
    `SELECT id, storeId, filename, type, status, totalRows, processedRows, errorCount, errorLog, createdAt
     FROM ImportJob WHERE id = ?`,
    [id],
  )
  if (!job) return err('Job not found', 404, 'NOT_FOUND')

  // Verify store ownership
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (storeId && (job as any).storeId !== storeId) {
    return err('Not found', 404, 'NOT_FOUND')
  }

  let errorLog: any[] = []
  try {
    errorLog = JSON.parse((job as any).errorLog ?? '[]')
  } catch {
    errorLog = []
  }

  const progress =
    (job as any).totalRows > 0
      ? Math.round(((job as any).processedRows / (job as any).totalRows) * 100)
      : 0

  return NextResponse.json({ ...(job as any), errorLog, progress })
}
