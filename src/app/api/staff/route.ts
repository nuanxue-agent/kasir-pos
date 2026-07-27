import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'

export const runtime = 'edge'


// GET /api/staff?storeId=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const staff = await prisma.storeUser.findMany({
    where: { storeId },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } } },
    orderBy: { user: { name: 'asc' } },
  })

  return NextResponse.json(staff)
}

const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  pin: z.string().length(4).optional(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER']),
})

// POST /api/staff
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { storeId, name, email, password, pin, role } = parsed.data

  // Check tenant
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 400 })

  const hashedPassword = await bcrypt.hash(password, 12)
  const hashedPin = pin ? await bcrypt.hash(pin, 10) : undefined

  const user = await prisma.user.create({
    data: {
      name, email, password: hashedPassword, pin: hashedPin,
      role, tenantId: store.tenantId,
      storeAccess: { create: { storeId, role } },
    },
  })

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 })
}
