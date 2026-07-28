import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureTestimonialTables } from '../route'
import { isValidStatusTransition } from '@/lib/testimonials'
import type { TestimonialStatus } from '@/lib/testimonials'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureTestimonialTables()

  const row = (await queryOne(`SELECT * FROM Testimonial WHERE id = ?`, [id])) as any
  if (!row) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    const validStatuses: TestimonialStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'FEATURED']
    if (!validStatuses.includes(b.status)) return err('Invalid status', 400, 'INVALID_FIELD')
    if (!isValidStatusTransition(row.status as TestimonialStatus, b.status as TestimonialStatus)) {
      return err(`Cannot transition from ${row.status} to ${b.status}`, 400, 'INVALID_STATE')
    }
    sets.push('status = ?'); vals.push(b.status)
  }

  if (b.customerName !== undefined) { sets.push('customerName = ?'); vals.push(b.customerName) }
  if (b.content !== undefined) { sets.push('content = ?'); vals.push(b.content) }
  if (b.rating !== undefined) { sets.push('rating = ?'); vals.push(Math.min(5, Math.max(1, Number(b.rating)))) }
  if (b.mediaUrl !== undefined) { sets.push('mediaUrl = ?'); vals.push(b.mediaUrl) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)
  await exec(`UPDATE Testimonial SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureTestimonialTables()

  const row = (await queryOne(`SELECT id FROM Testimonial WHERE id = ?`, [id])) as any
  if (!row) return err('Not found', 404, 'NOT_FOUND')

  await exec(`DELETE FROM Testimonial WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
