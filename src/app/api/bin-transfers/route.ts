import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBinLocationTables, validateTransfer, calcAvailableSpace } from '../bin-locations/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBinLocationTables()

  const rows = await query(
    `SELECT bt.*,
            fb.code as fromBinCode, fb.aisle as fromAisle, fb.rack as fromRack,
            tb.code as toBinCode, tb.aisle as toAisle, tb.rack as toRack,
            p.name as productName, p.sku as productSku
     FROM BinTransfer bt
     LEFT JOIN BinLocation fb ON fb.id = bt.fromBinId
     LEFT JOIN BinLocation tb ON tb.id = bt.toBinId
     LEFT JOIN Product p ON p.id = bt.productId
     WHERE bt.storeId = ?
     ORDER BY bt.createdAt DESC`,
    [storeId],
  )
  return NextResponse.json(rows as any[])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const body = await req.json() as any
  const { fromBinId, toBinId, productId, qty, note } = body
  if (!fromBinId || !toBinId || !productId || !qty) {
    return err('fromBinId, toBinId, productId, qty required', 400, 'MISSING_FIELD')
  }
  if (fromBinId === toBinId) return err('Source and destination bins must differ', 400, 'SAME_BIN')

  await ensureBinLocationTables()

  const fromBinRows = await query(`SELECT * FROM BinLocation WHERE id = ?`, [fromBinId])
  const toBinRows   = await query(`SELECT * FROM BinLocation WHERE id = ?`, [toBinId])
  const fromBin = (fromBinRows as any[])[0]
  const toBin   = (toBinRows as any[])[0]
  if (!fromBin) return err('Source bin not found', 404, 'NOT_FOUND')
  if (!toBin)   return err('Destination bin not found', 404, 'NOT_FOUND')

  const available = calcAvailableSpace(toBin.currentQty, toBin.capacity)
  const check = validateTransfer(qty, fromBin.currentQty, available)
  if (!check.valid) return err(check.error!, 422, 'TRANSFER_INVALID')

  const id = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO BinTransfer (id, storeId, fromBinId, toBinId, productId, qty, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, fromBinId, toBinId, productId, qty, note ?? null, createdAt],
  )

  // Update bin quantities
  await exec(`UPDATE BinLocation SET currentQty = currentQty - ? WHERE id = ?`, [qty, fromBinId])
  await exec(`UPDATE BinLocation SET currentQty = currentQty + ? WHERE id = ?`, [qty, toBinId])

  // Update or insert BinProduct for destination
  const destProduct = await query(
    `SELECT * FROM BinProduct WHERE binId = ? AND productId = ?`,
    [toBinId, productId],
  )
  if ((destProduct as any[]).length) {
    await exec(
      `UPDATE BinProduct SET qty = qty + ? WHERE binId = ? AND productId = ?`,
      [qty, toBinId, productId],
    )
  } else {
    await exec(
      `INSERT INTO BinProduct (id, binId, storeId, productId, qty) VALUES (?, ?, ?, ?, ?)`,
      [newId(), toBinId, storeId, productId, qty],
    )
  }

  // Reduce BinProduct on source
  await exec(
    `UPDATE BinProduct SET qty = qty - ? WHERE binId = ? AND productId = ?`,
    [qty, fromBinId, productId],
  )

  const row = await query(`SELECT * FROM BinTransfer WHERE id = ?`, [id])
  return NextResponse.json((row as any[])[0], { status: 201 })
}
