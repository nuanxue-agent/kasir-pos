// PATCH /api/nps-surveys/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const { id } = await params

  const existing = await queryOne(`SELECT * FROM NpsSurvey WHERE id=? AND storeId=?`, [id, storeId])
  if (!existing) return err('Survey not found', 404)

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}
  if (b.name !== undefined) updates.name = b.name.trim()
  if (b.question !== undefined) updates.question = b.question.trim()
  if (b.active !== undefined) updates.active = b.active ? 1 : 0
  if (Object.keys(updates).length === 0) return err('Nothing to update')

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  await exec(
    `UPDATE NpsSurvey SET ${setClauses} WHERE id=? AND storeId=?`,
    [...Object.values(updates), id, storeId],
  )
  return NextResponse.json({ updated: true })
}
