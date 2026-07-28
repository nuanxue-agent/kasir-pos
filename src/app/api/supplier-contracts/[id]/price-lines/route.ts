import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureSupplierContractTables } from '../../route'

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

  await ensureSupplierContractTables()

  // Join with Product to get productName and standard price for comparison
  const rows = await query(
    `SELECT cpl.*, p.name as productName, p.price as standardPrice
     FROM ContractPriceLine cpl
     LEFT JOIN Product p ON cpl.productId = p.id
     WHERE cpl.contractId = ? AND cpl.storeId = ?
     ORDER BY cpl.createdAt DESC`,
    [id, storeId],
  ).catch(() => [])

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

  await ensureSupplierContractTables()

  // Verify the contract exists and belongs to this store
  const contract = await queryOne(
    `SELECT * FROM SupplierContract WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any
  if (!contract) return err('Contract not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.unitPrice === undefined || b.unitPrice === null) {
    return err("Field 'unitPrice' is required", 400, 'MISSING_FIELD')
  }
  if (!b.validFrom) return err("Field 'validFrom' is required", 400, 'MISSING_FIELD')
  if (!b.validTo) return err("Field 'validTo' is required", 400, 'MISSING_FIELD')
  if (Number(b.unitPrice) < 0) return err('unitPrice must be >= 0', 400, 'INVALID_FIELD')
  const minOrderQty = Number(b.minOrderQty ?? 1)
  if (minOrderQty < 1) return err('minOrderQty must be >= 1', 400, 'INVALID_FIELD')

  const t = nowISO()
  const lineId = newId()
  await exec(
    `INSERT INTO ContractPriceLine (id, contractId, storeId, productId, unitPrice, minOrderQty, validFrom, validTo, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [lineId, id, storeId, b.productId, Number(b.unitPrice), minOrderQty,
     b.validFrom, b.validTo, t, t],
  )
  return NextResponse.json({ id: lineId }, { status: 201 })
}
