import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import DeliveryZoneClient from '@/components/pos/DeliveryZoneClient'

export const metadata = { title: 'Delivery Zones — POS' }

export default async function DeliveryZonesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS DeliveryZone (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    name             TEXT NOT NULL,
    minDistance      REAL NOT NULL DEFAULT 0,
    maxDistance      REAL NOT NULL DEFAULT 5,
    fee              REAL NOT NULL DEFAULT 0,
    estimatedMinutes INTEGER NOT NULL DEFAULT 30,
    active           INTEGER NOT NULL DEFAULT 1,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)

  const zonesRaw = await query(
    `SELECT * FROM DeliveryZone WHERE storeId = ? ORDER BY minDistance ASC`,
    [storeId],
  )

  const zones = (zonesRaw as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    minDistance: Number(r.minDistance),
    maxDistance: Number(r.maxDistance),
    fee: Number(r.fee),
    estimatedMinutes: Number(r.estimatedMinutes),
  }))

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <DeliveryZoneClient
        storeId={storeId}
        currency={currency}
        initialZones={zones}
      />
    </main>
  )
}
