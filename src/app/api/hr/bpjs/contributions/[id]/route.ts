import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBPJSTables } from '../../enrollments/route'

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

    const contribution = (await query(
      `SELECT * FROM BPJSContribution WHERE id = ?`,
      [id],
    ) as any[])[0]
    if (!contribution) return err('Contribution not found', 404)

    const b = (await req.json()) as any
    const t = nowISO()

    // Primary action: mark as paid
    if (b.action === 'mark_paid' || b.status === 'PAID') {
      if (contribution.status === 'PAID') return err('Already paid')
      const paidAt = b.paidAt ?? t
      await exec(
        `UPDATE BPJSContribution SET status = 'PAID', paidAt = ?, updatedAt = ? WHERE id = ?`,
        [paidAt, t, id],
      )
      return NextResponse.json({ ok: true, status: 'PAID', paidAt })
    }

    // Allow reverting to PENDING
    if (b.status === 'PENDING') {
      await exec(
        `UPDATE BPJSContribution SET status = 'PENDING', paidAt = NULL, updatedAt = ? WHERE id = ?`,
        [t, id],
      )
      return NextResponse.json({ ok: true, status: 'PENDING' })
    }

    return err('action must be mark_paid or status must be PAID/PENDING')
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
