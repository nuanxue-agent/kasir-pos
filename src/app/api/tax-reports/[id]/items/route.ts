import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTaxTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTaxTables()

  // Verify the report belongs to this store
  const report = (await query(
    `SELECT id FROM TaxReport WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any[]
  if (report.length === 0) return err('Not found', 404, 'NOT_FOUND')

  const rows = await query(
    `SELECT * FROM TaxItem WHERE reportId = ? ORDER BY createdAt ASC`,
    [id],
  )
  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTaxTables()

  const report = (await query(
    `SELECT * FROM TaxReport WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any[]
  if (report.length === 0) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  if (b.taxableAmount === undefined || b.taxableAmount === null)
    return err("Field 'taxableAmount' is required", 400, 'MISSING_FIELD')
  if (b.taxRate === undefined || b.taxRate === null)
    return err("Field 'taxRate' is required", 400, 'MISSING_FIELD')

  const taxableAmount = Number(b.taxableAmount)
  const taxRate       = Number(b.taxRate)
  const taxAmount     = b.taxAmount !== undefined ? Number(b.taxAmount) : Math.round(taxableAmount * taxRate * 100) / 100

  const itemId = newId()
  const now    = nowISO()

  await exec(
    `INSERT INTO TaxItem (id, reportId, storeId, reference, description, taxableAmount, taxRate, taxAmount, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      itemId,
      id,
      storeId,
      b.reference   ?? '',
      b.description ?? '',
      taxableAmount,
      taxRate,
      taxAmount,
      now,
    ],
  )

  // Recalculate report totals
  const agg = (await query(
    `SELECT SUM(taxableAmount) as totalTaxable, SUM(taxAmount) as taxAmount FROM TaxItem WHERE reportId = ?`,
    [id],
  )) as any[]

  await exec(
    `UPDATE TaxReport SET totalTaxable = ?, taxAmount = ?, updatedAt = ? WHERE id = ?`,
    [agg[0]?.totalTaxable ?? 0, agg[0]?.taxAmount ?? 0, nowISO(), id],
  )

  const created = (await query(`SELECT * FROM TaxItem WHERE id = ?`, [itemId])) as any[]
  return NextResponse.json(created[0], { status: 201 })
}
