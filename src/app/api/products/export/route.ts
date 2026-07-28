// GET /api/products/export?storeId=  — export all active products as CSV
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { CSV_HEADERS } from '@/lib/product-import'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function escapeCSV(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const products = await query(
    `SELECT p.name, p.sku, p.price, p.cost, p.stock, c.name AS categoryName
     FROM Product p
     LEFT JOIN Category c ON c.id = p.categoryId
     WHERE p.storeId = ? AND (p.active = 1 OR p.active IS NULL)
     ORDER BY p.name ASC`,
    [storeId],
  )

  const headerRow = CSV_HEADERS.join(',')
  const dataRows = (products as any[]).map(p =>
    [
      escapeCSV(p.name),
      escapeCSV(p.sku),
      escapeCSV(p.price),
      escapeCSV(p.cost),
      escapeCSV(p.stock),
      escapeCSV(p.categoryName),
    ].join(','),
  )

  const csv = [headerRow, ...dataRows].join('\r\n')
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="products-export-${date}.csv"`,
    },
  })
}
