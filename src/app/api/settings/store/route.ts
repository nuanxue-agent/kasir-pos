import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'edge'


const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  currency: z.string().optional(),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
})

// GET /api/settings/store?storeId=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(store)
}

// PATCH /api/settings/store
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { storeId, ...rest } = body

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const parsed = updateSchema.safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const store = await prisma.store.update({
    where: { id: storeId },
    data: parsed.data,
  })

  return NextResponse.json(store)
}
