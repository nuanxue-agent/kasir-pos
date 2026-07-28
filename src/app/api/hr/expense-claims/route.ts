import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { isValidCategory } from '@/lib/expense-claims'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ExpenseClaim (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER',
    receiptUrl TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    submittedAt TEXT,
    approvedBy TEXT,
    paidAt TEXT,
    notes TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    let sql = `SELECT ec.*, e.name as employeeName
      FROM ExpenseClaim ec
      LEFT JOIN Employee e ON e.id = ec.employeeId
      WHERE ec.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND ec.employeeId = ?'; params.push(employeeId) }
    if (status) { sql += ' AND ec.status = ?'; params.push(status) }

    sql += ' ORDER BY ec.createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as {
      storeId?: string
      employeeId?: string
      title?: string
      amount?: number
      category?: string
      receiptUrl?: string
      notes?: string
    }
    const { storeId, employeeId, title, amount, category = 'OTHER', receiptUrl, notes } = body

    if (!storeId || !employeeId || !title || amount == null) {
      return NextResponse.json({ error: 'storeId, employeeId, title, amount required' }, { status: 400 })
    }
    if (!isValidCategory(category)) {
      return NextResponse.json({ error: 'Invalid category. Must be TRAVEL, MEALS, SUPPLIES, or OTHER' }, { status: 400 })
    }
    if (amount <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ExpenseClaim (id, storeId, employeeId, title, amount, category, receiptUrl, status, submittedAt, approvedBy, paidAt, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, NULL, NULL, ?, ?, ?)`,
      [id, storeId, employeeId, title, amount, category, receiptUrl ?? null, notes ?? null, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
