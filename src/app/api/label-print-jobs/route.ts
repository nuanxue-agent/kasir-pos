import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLabelTables } from '../label-templates/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLabelTables()

  const status = req.nextUrl.searchParams.get('status')
  const whereClause = status ? `AND status = ?` : ''
  const params: any[] = status ? [storeId, status] : [storeId]

  const rows = await query(
    `SELECT * FROM LabelPrintJob WHERE storeId = ? ${whereClause} ORDER BY createdAt DESC`,
    params
  )

  const jobs = (rows as any[]).map(row => ({
    ...row,
    products: JSON.parse(row.products || '[]'),
  }))

  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLabelTables()

  const b = (await req.json()) as any
  if (!b.templateId) return err("Field 'templateId' is required", 400, 'MISSING_FIELD')
  if (!Array.isArray(b.products) || b.products.length === 0) {
    return err('At least one product is required', 400, 'MISSING_FIELD')
  }
  for (const p of b.products) {
    if (!p.productId) return err('Each product must have a productId', 400, 'INVALID_FIELD')
    if (typeof p.qty !== 'number' || p.qty < 1) {
      return err('Each product must have qty >= 1', 400, 'INVALID_FIELD')
    }
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO LabelPrintJob (id, storeId, templateId, products, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, storeId, b.templateId, JSON.stringify(b.products), t, t]
  )

  return NextResponse.json({ id }, { status: 201 })
}
