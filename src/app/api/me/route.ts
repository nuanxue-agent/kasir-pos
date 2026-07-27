import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

/**
 * GET /api/me — returns the current user's profile and store info
 */
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any

  const stores = user.stores ?? []
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin ?? false,
    tenantId: user.tenantId,
    stores: stores.map((s: any) => ({
      id: s.id,
      name: s.name,
      currency: s.currency ?? 'IDR',
      timezone: s.timezone ?? 'Asia/Jakarta',
      taxRate: s.taxRate ?? 0,
      modules: s.modules ? (typeof s.modules === 'string' ? JSON.parse(s.modules) : s.modules) : [],
    })),
  })
}
