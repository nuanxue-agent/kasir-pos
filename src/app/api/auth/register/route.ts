import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, exec, batchExec, newId, nowISO } from '@/lib/db'
import bcrypt from 'bcryptjs'

const schema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { businessName, name, email, password } = parsed.data

    const existing = await queryOne(`SELECT id FROM User WHERE email = ?`, [email])
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const plan = await queryOne<any>(`SELECT id FROM Plan WHERE name = 'FREE' LIMIT 1`)
    const planId = (plan as any)?.id ?? 'plan_free'

    const hashedPassword = await bcrypt.hash(password, 12)
    const t = nowISO()
    const tenantId = newId(); const userId = newId(); const storeId = newId()
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36)

    await batchExec([
      { sql: `INSERT INTO Tenant (id,name,slug,email,planId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,'TRIAL',?,?)`,
        params: [tenantId, businessName, slug, email, planId, t, t] },
      { sql: `INSERT INTO User (id,tenantId,name,email,password,role,active,isSuperAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,'OWNER',1,0,?,?)`,
        params: [userId, tenantId, name, email, hashedPassword, t, t] },
      { sql: `INSERT INTO Store (id,tenantId,name,taxRate,currency,timezone,active,createdAt,updatedAt) VALUES (?,?,?,0,'IDR','Asia/Jakarta',1,?,?)`,
        params: [storeId, tenantId, businessName, t, t] },
      { sql: `INSERT INTO StoreUser (id,storeId,userId,role) VALUES (?,?,?,'OWNER')`,
        params: [newId(), storeId, userId] },
    ])

    return NextResponse.json({ success: true, email }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
