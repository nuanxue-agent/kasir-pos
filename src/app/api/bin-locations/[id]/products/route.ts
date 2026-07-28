import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureBinLocationTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params

  await ensureBinLocationTables()

  const rows = await query(
    `SELECT bp.*, p.name as productName, p.sku
     FROM BinProduct bp
     LEFT JOIN Product p ON p.id = bp.productId
     WHERE bp.binId = ?
     ORDER BY p.name`,
    [id],
  )
  return NextResponse.json(rows as any[])
}
