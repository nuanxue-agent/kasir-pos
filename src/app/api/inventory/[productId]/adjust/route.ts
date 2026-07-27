import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'edge'


const adjustSchema = z.object({
  type: z.enum(['ADJUSTMENT', 'RESTOCK']),
  qty: z.number().int().refine(val => val !== 0, 'Qty cannot be 0'),
  note: z.string().optional(),
})

// POST /api/inventory/:productId/adjust
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productId } = await params
  const body = await req.json()
  const parsed = adjustSchema.safeParse(body)
  
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { type, qty, note } = parsed.data

  // Get product
  const product = await prisma.product.findUnique({
    where: { id: productId },
  })

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  if (!product.trackStock) {
    return NextResponse.json({ error: 'Product does not track stock' }, { status: 400 })
  }

  // Calculate new stock
  const newStock = Math.max(0, product.stock + qty)

  // Update product and create log in transaction
  const updatedProduct = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
      include: { category: true },
    })

    await tx.stockLog.create({
      data: {
        productId,
        type,
        qty,
        note: note || (type === 'RESTOCK' ? 'Stock restock' : 'Stock adjustment'),
      },
    })

    return updated
  })

  return NextResponse.json(updatedProduct)
}
