import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'

// PATCH /api/staff/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const updates: Record<string, any> = {}
  if (body.name) updates.name = body.name
  if (body.role) updates.role = body.role
  if (body.active !== undefined) updates.active = body.active
  if (body.password) updates.password = await bcrypt.hash(body.password, 12)
  if (body.pin) updates.pin = await bcrypt.hash(body.pin, 10)

  const user = await prisma.user.update({ where: { id }, data: updates })

  // Update store role if changed
  if (body.role && body.storeId) {
    await prisma.storeUser.updateMany({
      where: { userId: id, storeId: body.storeId },
      data: { role: body.role },
    })
  }

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active })
}

// DELETE /api/staff/[id] (deactivate)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await prisma.user.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
