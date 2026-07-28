import { NextRequest, NextResponse } from 'next/server'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export const DELIVERY_ZONES = [
  { label: 'Zone 1', maxKm: 5, fee: 5_000 },
  { label: 'Zone 2', maxKm: 10, fee: 10_000 },
  { label: 'Zone 3', maxKm: 20, fee: 20_000 },
] as const

export function calculateDeliveryFee(distanceKm: number): { fee: number; zone: string } {
  for (const zone of DELIVERY_ZONES) {
    if (distanceKm <= zone.maxKm) return { fee: zone.fee, zone: zone.label }
  }
  return { fee: 25_000, zone: 'Luar Zona' }
}

// POST /api/delivery/calculate-fee
// Body: { distance: number }  — distance in km
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { distance?: unknown }

    if (body.distance === undefined || body.distance === null) {
      return err('distance is required')
    }

    const distance = Number(body.distance)
    if (isNaN(distance) || distance < 0) {
      return err('distance must be a non-negative number')
    }

    const { fee, zone } = calculateDeliveryFee(distance)

    return ok({
      distance,
      fee,
      zone,
      lineItem: {
        name: `Ongkos Kirim (${zone})`,
        price: fee,
        qty: 1,
        type: 'DELIVERY_FEE',
      },
    })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
