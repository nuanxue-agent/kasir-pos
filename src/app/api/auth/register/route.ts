import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { queryOne, batch, newId, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


const registerSchema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validatedData = registerSchema.parse(body)

    const { env } = getRequestContext()
    const db = env.DB as D1Database

    // Check if email already exists
    const existingUser = await queryOne(db,
      `SELECT id FROM User WHERE email = ?`,
      [validatedData.email]
    )
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Find FREE plan
    const freePlan = await queryOne<{ id: string }>(db,
      `SELECT id FROM Plan WHERE name = 'FREE' LIMIT 1`,
      []
    )
    if (!freePlan) {
      return NextResponse.json(
        { error: 'Free plan not found. Please contact support.' },
        { status: 500 }
      )
    }

    // Generate slug from business name
    const baseSlug = validatedData.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Ensure slug uniqueness
    const slugConflict = await queryOne(db, `SELECT id FROM Tenant WHERE slug = ?`, [baseSlug])
    const slug = slugConflict ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)

    // Generate IDs up front
    const tenantId = newId()
    const userId   = newId()
    const storeId  = newId()
    const suId     = newId()
    const now      = toSQLiteDate(new Date())

    // Create tenant, user, store, and store-user access in a single batch
    await batch(db, [
      {
        sql: `INSERT INTO Tenant (id, name, slug, email, planId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [tenantId, validatedData.businessName, slug, validatedData.email, freePlan.id, now, now],
      },
      {
        sql: `INSERT INTO User (id, name, email, password, role, tenantId, active, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'OWNER', ?, 1, ?, ?)`,
        params: [userId, validatedData.name, validatedData.email, hashedPassword, tenantId, now, now],
      },
      {
        sql: `INSERT INTO Store (id, name, tenantId, active, createdAt, updatedAt)
              VALUES (?, ?, ?, 1, ?, ?)`,
        params: [storeId, `${validatedData.businessName} - Main Store`, tenantId, now, now],
      },
      {
        sql: `INSERT INTO StoreUser (id, userId, storeId, role, createdAt, updatedAt)
              VALUES (?, ?, ?, 'OWNER', ?, ?)`,
        params: [suId, userId, storeId, now, now],
      },
    ])

    return NextResponse.json({
      success: true,
      email: validatedData.email,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    )
  }
}
