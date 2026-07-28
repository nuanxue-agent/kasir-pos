// GET /api/returns/:id/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  // Verify the return belongs to this store
  const [ret] = (await query(
    `SELECT id FROM Return WHERE id=? AND storeId=?`,
    [id, storeId],
  )) as any[]
  if (!ret) return err('Return not found', 404, 'NOT_FOUND')

  const items = await query(
    `SELECT * FROM ReturnItem WHERE returnId=? ORDER BY rowid ASC`,
    [id],
  )

  return NextResponse.json(items)
}
