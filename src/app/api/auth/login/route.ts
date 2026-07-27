import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, setSessionCookie } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import bcrypt from 'bcryptjs'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { email, password } = parsed.data

    const user = await queryOne<any>(`SELECT * FROM User WHERE email = ? AND active = 1`, [email])
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

    const valid = await bcrypt.compare(password, user.password ?? '')
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

    const stores = await query<any>(
      `SELECT su.storeId as id, s.name, su.role, s.currency, s.taxRate
       FROM StoreUser su JOIN Store s ON su.storeId = s.id WHERE su.userId = ?`,
      [user.id]
    )

    const sessionUser = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, tenantId: user.tenantId,
      stores,
    }

    const token = await createSession(sessionUser)
    const res = NextResponse.json({ success: true, user: sessionUser })
    setSessionCookie(res, token)
    return res
  } catch (e: any) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
