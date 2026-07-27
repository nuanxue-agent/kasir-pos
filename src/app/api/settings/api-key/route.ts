// GET /api/settings/api-key?storeId=xxx
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const storeId = req.nextUrl.searchParams.get('storeId') ?? ''
  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 404)

  const row = await queryOne<any>(
    'SELECT apiKey, apiKeyLastUsedAt, apiKeyCreatedAt FROM Store WHERE id = ?',
    [storeId],
  )

  return NextResponse.json({
    key: row?.apiKey ?? null,
    lastUsedAt: row?.apiKeyLastUsedAt ?? null,
    createdAt: row?.apiKeyCreatedAt ?? null,
  })
}
