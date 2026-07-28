// POST /api/import-jobs/[id]/process  — trigger processing of an import job
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, query, newId, nowISO } from '@/lib/db'
import { parseAndValidateCSV } from '@/lib/product-import'

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

async function ensureProductTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Product (
      id         TEXT PRIMARY KEY,
      storeId    TEXT NOT NULL,
      name       TEXT NOT NULL,
      sku        TEXT,
      price      REAL NOT NULL DEFAULT 0,
      cost       REAL NOT NULL DEFAULT 0,
      stock      INTEGER NOT NULL DEFAULT 0,
      categoryId TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
    )
  `)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params

  await ensureTable()

  const job = await queryOne(`SELECT * FROM ImportJob WHERE id = ?`, [id])
  if (!job) return err('Job not found', 404, 'NOT_FOUND')

  const j = job as any
  const storeId = j.storeId

  // Verify store ownership
  const reqStoreId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (reqStoreId && storeId !== reqStoreId) {
    return err('Not found', 404, 'NOT_FOUND')
  }

  if (j.status === 'PROCESSING') {
    return err('Job is already processing', 409, 'CONFLICT')
  }
  if (j.status === 'COMPLETED') {
    return err('Job already completed', 409, 'CONFLICT')
  }

  // Mark as PROCESSING
  await exec(`UPDATE ImportJob SET status = 'PROCESSING' WHERE id = ?`, [id])

  const body = (await req.json()) as any
  const csvText: string = body.csvText ?? ''

  if (!csvText.trim()) {
    await exec(
      `UPDATE ImportJob SET status = 'FAILED', errorLog = ? WHERE id = ?`,
      [JSON.stringify([{ row: 0, message: 'No CSV data provided' }]), id],
    )
    return err('No CSV data provided', 400, 'MISSING_FIELD')
  }

  const rows = parseAndValidateCSV(csvText)
  const totalRows = rows.length

  // Load existing SKUs for upsert detection
  await ensureProductTable()
  const existingProducts = await query(
    `SELECT id, sku FROM Product WHERE storeId = ?`,
    [storeId],
  )
  const skuToId = new Map<string, string>(
    (existingProducts as any[]).filter(p => p.sku).map(p => [p.sku, p.id]),
  )

  let processedRows = 0
  let errorCount = 0
  const errorLog: { row: number; field?: string; message: string }[] = []

  const now = nowISO()

  for (const row of rows) {
    if (row.errors.length > 0) {
      errorCount++
      for (const e of row.errors) {
        errorLog.push({ row: row.rowIndex, field: e.field, message: e.message })
      }
      processedRows++
      continue
    }

    const d = row.data
    try {
      const existingId = d.sku ? skuToId.get(d.sku) : undefined
      if (existingId) {
        await exec(
          `UPDATE Product SET name = ?, price = ?, cost = ?, stock = ?, updatedAt = ? WHERE id = ?`,
          [d.name, d.price ?? 0, d.cost ?? 0, d.stock ?? 0, now, existingId],
        )
      } else {
        const pid = newId()
        await exec(
          `INSERT INTO Product (id, storeId, name, sku, price, cost, stock, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [pid, storeId, d.name, d.sku || null, d.price ?? 0, d.cost ?? 0, d.stock ?? 0, now, now],
        )
        if (d.sku) skuToId.set(d.sku, pid)
      }
    } catch (e: any) {
      errorCount++
      errorLog.push({ row: row.rowIndex, message: e?.message ?? 'DB error' })
    }

    processedRows++
  }

  const finalStatus = errorCount === totalRows && totalRows > 0 ? 'FAILED' : 'COMPLETED'

  await exec(
    `UPDATE ImportJob
     SET status = ?, totalRows = ?, processedRows = ?, errorCount = ?, errorLog = ?
     WHERE id = ?`,
    [finalStatus, totalRows, processedRows, errorCount, JSON.stringify(errorLog), id],
  )

  return NextResponse.json({
    id,
    status: finalStatus,
    totalRows,
    processedRows,
    errorCount,
    created: processedRows - errorCount,
  })
}
