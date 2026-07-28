import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureDeliveryZoneTables } from '../route'
import { findZoneForDistance, calcDeliveryFee } from '@/components/pos/DeliveryZoneClient'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureDeliveryZoneTables()

  const b = (await req.json()) as any
  if (b.distance === undefined || b.distance === null) return err("Field 'distance' is required", 400, 'MISSING_FIELD')

  const distance = Number(b.distance)
  if (isNaN(distance) || distance < 0) return err('distance must be a non-negative number', 400, 'INVALID_FIELD')

  const orderTotal = Number(b.orderTotal ?? 0)
  const freeDeliveryThreshold = Number(b.freeDeliveryThreshold ?? 0)

  const rows = await query(
    `SELECT * FROM DeliveryZone WHERE storeId = ? AND active = 1 ORDER BY minDistance ASC`,
    [storeId],
  )

  const zones = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    minDistance: Number(r.minDistance),
    maxDistance: Number(r.maxDistance),
    fee: Number(r.fee),
    estimatedMinutes: Number(r.estimatedMinutes),
  }))

  const zone = findZoneForDistance(zones, distance)
  const { fee, isFree } = calcDeliveryFee(zones, distance, orderTotal, freeDeliveryThreshold)

  return NextResponse.json({
    zone,
    fee,
    isFree,
    estimatedMinutes: zone?.estimatedMinutes ?? 0,
    covered: zone !== null,
  })
}
