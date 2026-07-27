import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'

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
    
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }
    
    // Find FREE plan
    const freePlan = await prisma.plan.findFirst({
      where: { name: 'FREE' },
    })
    
    if (!freePlan) {
      return NextResponse.json(
        { error: 'Free plan not found. Please contact support.' },
        { status: 500 }
      )
    }
    
    // Generate slug from business name
    const slug = validatedData.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)
    
    // Create tenant, user, and default store in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: validatedData.businessName,
          slug,
          email: validatedData.email,
          planId: freePlan.id,
        },
      })
      
      // Create user (OWNER role)
      const user = await tx.user.create({
        data: {
          name: validatedData.name,
          email: validatedData.email,
          password: hashedPassword,
          role: 'OWNER',
          tenantId: tenant.id,
          active: true,
        },
      })
      
      // Create default store
      const store = await tx.store.create({
        data: {
          name: `${validatedData.businessName} - Main Store`,
          tenantId: tenant.id,
          active: true,
        },
      })
      
      // Grant user access to the store
      await tx.storeUser.create({
        data: {
          userId: user.id,
          storeId: store.id,
        },
      })
      
      return { user, tenant, store }
    })
    
    return NextResponse.json({
      success: true,
      email: result.user.email,
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
