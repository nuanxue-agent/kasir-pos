import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { z } from 'zod'

export const runtime = 'edge'

const schema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

function id() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { businessName, name, email, password } = parsed.data

    const { env } = getRequestContext()
    const db = (env as any).DB as D1Database

    // Check email not taken
    const existing = await db.prepare('SELECT id FROM User WHERE email = ?').bind(email).first()
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    // Get FREE plan
    const plan = await db.prepare("SELECT id FROM Plan WHERE name = 'FREE' LIMIT 1").first<{ id: string }>()
    const planId = plan?.id ?? 'plan_free'

    // Hash password
    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.hash(password, 12)

    const now = new Date().toISOString()
    const tenantId = id()
    const userId = id()
    const storeId = id()
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36)

    // Create tenant, user, store, store user in a batch
    await db.batch([
      db.prepare(
        `INSERT INTO Tenant (id, name, slug, email, planId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'TRIAL', ?, ?)`
      ).bind(tenantId, businessName, slug, email, planId, now, now),

      db.prepare(
        `INSERT INTO User (id, tenantId, name, email, password, role, active, isSuperAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'OWNER', 1, 0, ?, ?)`
      ).bind(userId, tenantId, name, email, hashedPassword, now, now),

      db.prepare(
        `INSERT INTO Store (id, tenantId, name, taxRate, currency, timezone, active, createdAt, updatedAt)
         VALUES (?, ?, ?, 0, 'IDR', 'Asia/Jakarta', 1, ?, ?)`
      ).bind(storeId, tenantId, businessName, now, now),

      db.prepare(
        `INSERT INTO StoreUser (id, storeId, userId, role) VALUES (?, ?, ?, 'OWNER')`
      ).bind(id(), storeId, userId),
    ])

    return NextResponse.json({ success: true, email }, { status: 201 })
  } catch (error: any) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
