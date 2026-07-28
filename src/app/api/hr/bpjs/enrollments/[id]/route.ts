import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBPJSTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureBPJSTables()

    const enrollment = (await query(
      `SELECT * FROM BPJSEnrollment WHERE id = ?`,
      [id],
    ) as any[])[0]
    if (!enrollment) return err('Enrollment not found', 404)

    const b = (await req.json()) as any
    const t = nowISO()

    const allowed = ['ACTIVE', 'INACTIVE', 'PENDING']
    if (b.status && !allowed.includes(b.status)) {
      return err(`status must be one of: ${allowed.join(', ')}`)
    }

    const updates: string[] = []
    const vals: any[] = []

    if (b.status !== undefined) {
      updates.push('status = ?')
      vals.push(b.status)
      if (b.status === 'INACTIVE') {
        updates.push('terminatedAt = ?')
        vals.push(t)
      }
    }
    if (b.memberNumber !== undefined) { updates.push('memberNumber = ?'); vals.push(b.memberNumber) }
    if (b.class !== undefined) { updates.push('class = ?'); vals.push(b.class) }

    if (updates.length === 0) return err('No fields to update')

    updates.push('updatedAt = ?')
    vals.push(t)
    vals.push(id)

    await exec(`UPDATE BPJSEnrollment SET ${updates.join(', ')} WHERE id = ?`, vals)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
