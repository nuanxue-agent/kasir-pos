// GET /api/warehouses/:id/stock
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS WarehouseStock (
      id          TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      productId   TEXT NOT NULL,
      qty         REAL NOT NULL DEFAULT 0,
      minQty      REAL NOT NULL DEFAULT 0,
      updatedAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTables()

  const { id } = await params

  const stock = (await query(
    `SELECT ws.*, p.name as productName, p.sku
       FROM WarehouseStock ws
       LEFT JOIN Product p ON ws.productId = p.id
      WHERE ws.warehouseId = ?
      ORDER BY p.name ASC`,
    [id],
  )) as any[]

  return NextResponse.json({ stock })
}
