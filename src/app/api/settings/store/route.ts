// API route: PATCH /api/settings/store
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'

const schema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  taxRate: z.number().min(0).max(1).optional(),
  currency: z.string().min(1).optional(),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
  modules: z.string().optional(),
  // Branding fields
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  // Integration fields
  apiKey: z.string().optional(),
  webhookUrl: z.string().optional(),
  // Payment methods (JSON string)
  paymentMethods: z.string().optional(),
})

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return err(parsed.error.issues[0].message)

    const {
      storeId,
      taxRate,
      modules,
      name,
      address,
      phone,
      email,
      receiptNote,
      timezone,
      logoUrl,
      primaryColor,
      receiptHeader,
      receiptFooter,
      apiKey,
      webhookUrl,
      paymentMethods,
    } = parsed.data

    // Verify user has access to this store
    if (!storeIds.includes(storeId)) return err('Store not found', 404)

    // Build dynamic SET clause
    const fields: string[] = []
    const params: unknown[] = []

    if (name !== undefined) {
      fields.push('name = ?')
      params.push(name)
    }
    if (address !== undefined) {
      fields.push('address = ?')
      params.push(address ?? null)
    }
    if (phone !== undefined) {
      fields.push('phone = ?')
      params.push(phone ?? null)
    }
    if (email !== undefined) {
      fields.push('email = ?')
      params.push(email || null)
    }
    if (taxRate !== undefined) {
      fields.push('taxRate = ?')
      params.push(taxRate)
    }
    if (timezone !== undefined) {
      fields.push('timezone = ?')
      params.push(timezone)
    }
    if (receiptNote !== undefined) {
      fields.push('receiptNote = ?')
      params.push(receiptNote ?? null)
    }
    if (modules !== undefined) {
      fields.push('modules = ?')
      params.push(modules)
    }
    if (logoUrl !== undefined) {
      fields.push('logoUrl = ?')
      params.push(logoUrl || null)
    }
    if (primaryColor !== undefined) {
      fields.push('primaryColor = ?')
      params.push(primaryColor || null)
    }
    if (receiptHeader !== undefined) {
      fields.push('receiptHeader = ?')
      params.push(receiptHeader || null)
    }
    if (receiptFooter !== undefined) {
      fields.push('receiptFooter = ?')
      params.push(receiptFooter || null)
    }
    if (apiKey !== undefined) {
      fields.push('apiKey = ?')
      params.push(apiKey || null)
    }
    if (webhookUrl !== undefined) {
      fields.push('webhookUrl = ?')
      params.push(webhookUrl || null)
    }
    if (paymentMethods !== undefined) {
      fields.push('paymentMethods = ?')
      params.push(paymentMethods || null)
    }

    if (fields.length === 0) return ok({ success: true })

    fields.push('updatedAt = ?')
    params.push(nowISO())
    params.push(storeId)

    await exec(`UPDATE Store SET ${fields.join(', ')} WHERE id = ?`, params as any[])

    return ok({ success: true })
  } catch (e: any) {
    console.error('Settings store error:', e)
    return err('Gagal menyimpan pengaturan', 500)
  }
}
