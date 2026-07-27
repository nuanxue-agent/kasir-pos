import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne, exec, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  currency: z.string().optional(),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
})

// GET /api/settings/store?storeId=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const store = await queryOne(db, `SELECT * FROM Store WHERE id = ?`, [storeId])
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(store)
}

// PATCH /api/settings/store
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw: any = await req.json()
  const storeId: string | undefined = raw.storeId

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  // Strip storeId before validation
  const { storeId: _sid, ...rest } = raw as { storeId: string; [k: string]: unknown }

  const parsed = updateSchema.safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const data = parsed.data
  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined)        { fields.push('name = ?');        values.push(data.name) }
  if (data.address !== undefined)     { fields.push('address = ?');     values.push(data.address) }
  if (data.phone !== undefined)       { fields.push('phone = ?');       values.push(data.phone) }
  if (data.email !== undefined)       { fields.push('email = ?');       values.push(data.email) }
  if (data.taxRate !== undefined)     { fields.push('taxRate = ?');     values.push(data.taxRate) }
  if (data.currency !== undefined)    { fields.push('currency = ?');    values.push(data.currency) }
  if (data.receiptNote !== undefined) { fields.push('receiptNote = ?'); values.push(data.receiptNote) }
  if (data.timezone !== undefined)    { fields.push('timezone = ?');    values.push(data.timezone) }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updatedAt = ?')
  values.push(toSQLiteDate(new Date()))
  values.push(storeId)

  await exec(db, `UPDATE Store SET ${fields.join(', ')} WHERE id = ?`, values)

  const store = await queryOne(db, `SELECT * FROM Store WHERE id = ?`, [storeId])
  if (!store) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(store)
}
