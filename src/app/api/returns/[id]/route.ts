// PATCH /api/returns/:id  — approve / reject / complete
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED', 'REJECTED'],
  REJECTED: [],
  COMPLETED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id

  const { id } = await params
  const b = (await req.json()) as any

  const resolvedStoreId = b.storeId ?? storeId
  if (!resolvedStoreId) return err('storeId required', 400, 'MISSING_FIELD')

  const existing = (await queryOne(
    `SELECT * FROM Return WHERE id=? AND storeId=?`,
    [id, resolvedStoreId],
  )) as any
  if (!existing) return err('Return not found', 404, 'NOT_FOUND')

  const newStatus: string = b.status
  if (!newStatus) return err('status required', 400, 'MISSING_FIELD')

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(newStatus)) {
    return err(
      `Cannot transition from ${existing.status} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  const processedBy: string = user.name ?? user.email ?? 'unknown'

  await exec(
    `UPDATE Return SET status=?, processedBy=? WHERE id=? AND storeId=?`,
    [newStatus, processedBy, id, resolvedStoreId],
  )

  // When completing: restore stock for each returned item
  if (newStatus === 'COMPLETED') {
    const rows = (await query(
      `SELECT productId, qty FROM ReturnItem WHERE returnId=?`,
      [id],
    )) as any[]
    for (const row of rows) {
      // Best-effort stock restoration — silently ignore if Product table structure differs
      try {
        await exec(
          `UPDATE Product SET stock = stock + ? WHERE id=?`,
          [row.qty, row.productId],
        )
      } catch {
        // Stock column may not exist on all product schemas — non-fatal
      }
    }
  }

  return NextResponse.json({ updated: true, status: newStatus, processedBy })
}
