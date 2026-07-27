// POST /api/settings/api-key/rotate
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { generateApiKey } from '@/lib/receipt-settings'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const body = await req.json().catch(() => ({})) as { storeId?: string }
  const { storeId } = body
  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 404)

  const newKey = generateApiKey()
  const now = nowISO()

  await exec(
    'UPDATE Store SET apiKey = ?, apiKeyCreatedAt = ?, apiKeyLastUsedAt = NULL WHERE id = ?',
    [newKey, now, storeId],
  )

  return NextResponse.json({ key: newKey, createdAt: now, lastUsedAt: null })
}
