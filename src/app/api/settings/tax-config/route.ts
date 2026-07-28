// API route: GET /api/settings/tax-config  — fetch TaxConfig for a store
//            POST /api/settings/tax-config  — upsert TaxConfig for a store
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS TaxConfig (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    ppnRate REAL NOT NULL DEFAULT 0.11,
    ppnEnabled INTEGER NOT NULL DEFAULT 1,
    ppnIncluded INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`

async function ensureTable() {
  await query(INIT_SQL)
}

const schema = z.object({
  storeId: z.string().min(1),
  ppnRate: z.number().min(0).max(1).optional(),
  ppnEnabled: z.boolean().optional(),
  ppnIncluded: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    await ensureTable()

    const config = await queryOne<any>(
      `SELECT id, storeId, ppnRate, ppnEnabled, ppnIncluded, createdAt, updatedAt
       FROM TaxConfig WHERE storeId = ? LIMIT 1`,
      [storeId],
    )

    if (!config) {
      // Return defaults without persisting
      return ok({
        id: null,
        storeId,
        ppnRate: 0.11,
        ppnEnabled: true,
        ppnIncluded: false,
      })
    }

    return ok({
      ...config,
      ppnEnabled: Boolean(config.ppnEnabled),
      ppnIncluded: Boolean(config.ppnIncluded),
    })
  } catch (e: any) {
    console.error('TaxConfig GET error:', e)
    return err('Gagal memuat konfigurasi pajak', 500)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  try {
    await ensureTable()

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return err(parsed.error.issues[0].message)

    const { storeId, ppnRate, ppnEnabled, ppnIncluded } = parsed.data

    if (!storeIds.includes(storeId)) return err('Store not found', 403)

    const existing = await queryOne<any>(
      `SELECT id FROM TaxConfig WHERE storeId = ? LIMIT 1`,
      [storeId],
    )

    const now = nowISO()

    if (existing) {
      const fields: string[] = []
      const params: any[] = []

      if (ppnRate !== undefined) { fields.push('ppnRate = ?'); params.push(ppnRate) }
      if (ppnEnabled !== undefined) { fields.push('ppnEnabled = ?'); params.push(ppnEnabled ? 1 : 0) }
      if (ppnIncluded !== undefined) { fields.push('ppnIncluded = ?'); params.push(ppnIncluded ? 1 : 0) }

      if (fields.length > 0) {
        fields.push('updatedAt = ?')
        params.push(now)
        params.push(existing.id)
        await exec(`UPDATE TaxConfig SET ${fields.join(', ')} WHERE id = ?`, params)
      }
    } else {
      await exec(
        `INSERT INTO TaxConfig (id, storeId, ppnRate, ppnEnabled, ppnIncluded, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          storeId,
          ppnRate ?? 0.11,
          ppnEnabled !== undefined ? (ppnEnabled ? 1 : 0) : 1,
          ppnIncluded !== undefined ? (ppnIncluded ? 1 : 0) : 0,
          now,
          now,
        ],
      )
    }

    return ok({ success: true })
  } catch (e: any) {
    console.error('TaxConfig POST error:', e)
    return err('Gagal menyimpan konfigurasi pajak', 500)
  }
}
