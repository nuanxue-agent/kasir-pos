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
  await exec(`CREATE TABLE IF NOT EXISTS DeliveryOrder (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    courierId TEXT,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    estimatedAt TEXT,
    deliveredAt TEXT,
    notes TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
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

// GET /api/delivery/orders?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const rows = await query(
      `SELECT d.*, c.name as courierName
       FROM DeliveryOrder d
       LEFT JOIN Courier c ON c.id = d.courierId
       WHERE d.storeId = ?
       ORDER BY d.createdAt DESC`,
      [storeId],
    )

    return ok({ data: rows })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/delivery/orders
// Body: { orderId, storeId?, address, courierId?, estimatedAt?, notes? }
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

    if (!body.orderId) return err('orderId is required')
    if (!body.address) return err('address is required')

    await ensureTables()

    const id = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO DeliveryOrder (id,orderId,storeId,courierId,address,status,estimatedAt,deliveredAt,notes,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        body.orderId as string,
        storeId,
        (body.courierId as string) ?? null,
        body.address as string,
        'PENDING',
        (body.estimatedAt as string) ?? null,
        null,
        (body.notes as string) ?? null,
        t,
        t,
      ],
    )

    return ok({ id, orderId: body.orderId, status: 'PENDING' }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
