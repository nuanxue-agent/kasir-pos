import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { z } from 'zod'
import { createSession, setSessionCookie } from '@/lib/auth'

export const runtime = 'edge'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { email, password } = parsed.data
    const { env } = getRequestContext()
    const db = (env as any).DB as D1Database

    // Get user
    const user = await db.prepare('SELECT * FROM User WHERE email = ? AND active = 1').bind(email).first<any>()
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Verify password
    const bcrypt = await import('bcryptjs')
    const valid = await bcrypt.compare(password, user.password ?? '')
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Get stores
    const stores = await db.prepare(
      `SELECT su.storeId as id, s.name, su.role, s.currency, s.taxRate
       FROM StoreUser su JOIN Store s ON su.storeId = s.id
       WHERE su.userId = ?`
    ).bind(user.id).all()

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      stores: stores.results ?? [],
    }

    const token = await createSession(sessionUser)
    const res = NextResponse.json({ success: true, user: sessionUser })
    setSessionCookie(res, token)
    
    return res
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
