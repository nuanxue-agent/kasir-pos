import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function getStoreId(req: NextRequest): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as { stores?: { id: string }[] }
  const urlStoreId = new URL(req.url).searchParams.get('storeId')
  if (urlStoreId) {
    const hasAccess = user.stores?.some(s => s.id === urlStoreId) ?? false
    return hasAccess ? urlStoreId : null
  }
  return user.stores?.[0]?.id ?? null
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Courier (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    vehicleType TEXT NOT NULL DEFAULT 'Motor',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

// GET /api/delivery/couriers?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const rows = await query(
      `SELECT * FROM Courier WHERE storeId = ? ORDER BY name`,
      [storeId],
    )

    const couriers = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      active: Boolean(r.active),
    }))

    return ok({ data: couriers })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/delivery/couriers
// Body: { name, phone, vehicleType?, active?, storeId? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as Record<string, unknown>
    const user = session.user as { stores?: { id: string }[] }
    const storeId: string = (body.storeId as string) ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.name?.toString().trim()) return err('name is required')
    if (!body.phone?.toString().trim()) return err('phone is required')

    await ensureTables()

    const id = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO Courier (id,storeId,name,phone,vehicleType,active,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        storeId,
        body.name.toString().trim(),
        body.phone.toString().trim(),
        (body.vehicleType as string) ?? 'Motor',
        body.active !== false ? 1 : 0,
        t,
        t,
      ],
    )

    return ok({ id, name: body.name, phone: body.phone, vehicleType: body.vehicleType ?? 'Motor', active: true }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
