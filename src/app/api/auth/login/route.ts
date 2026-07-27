import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, setSessionCookie } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import bcrypt from 'bcryptjs'

// ─── In-memory rate limiter (per IP, resets every window) ────────────────────
// In a multi-instance deploy you'd use Redis/KV, but this covers single-region.
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10 // max attempts
const RATE_WINDOW = 60_000 // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429 },
    )
  }

  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { email, password } = parsed.data

    const user = await queryOne<any>(`SELECT * FROM User WHERE email = ? AND active = 1`, [email])
    // Use constant-time compare even when user not found to prevent timing attacks
    const hashToCompare = user?.password ?? '$2b$12$invalidhashpaddingtomakeconstanttime'
    const valid = await bcrypt.compare(password, hashToCompare)
    if (!user || !valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

    const stores = await query<any>(
      `SELECT su.storeId as id, s.name, su.role, s.currency, s.taxRate,
              COALESCE(s.modules, '["pos","inventory","customers","discounts","reports"]') as modules
       FROM StoreUser su JOIN Store s ON su.storeId = s.id WHERE su.userId = ?`,
      [user.id],
    )

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      onboarded: !!user.onboarded,
      stores: stores.map((s: any) => ({
        ...s,
        modules: (() => {
          try {
            return JSON.parse(s.modules)
          } catch {
            return ['pos', 'inventory', 'customers', 'discounts', 'reports']
          }
        })(),
      })),
    }

    const token = await createSession(sessionUser)
    const res = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
    setSessionCookie(res, token)
    // Fire-and-forget audit log
    const primaryStoreId = stores[0]?.id ?? ''
    if (primaryStoreId) {
      logAudit({
        storeId: primaryStoreId,
        userId: user.id,
        action: 'LOGIN',
        meta: { email: user.email },
      }).catch(() => {})
    }
    return res
  } catch (e) {
    console.error('[login]', e)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
