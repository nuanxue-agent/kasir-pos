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

// Stub: fetch orders from WooCommerce
async function fetchWooCommerceOrders(_config: any): Promise<any[]> {
  // Real impl would call config.storeUrl + '/wp-json/wc/v3/orders' with apiKey
  return [
    {
      externalId: `wc-${Date.now()}`,
      customerName: 'Budi Santoso',
      items: [{ sku: 'PROD-001', name: 'Kopi Susu', qty: 2, price: 25000 }],
      total: 50000,
      status: 'processing',
    },
  ]
}

// Stub: fetch orders from Tokopedia
async function fetchTokopediaOrders(_config: any): Promise<any[]> {
  return [
    {
      externalId: `toped-${Date.now()}`,
      customerName: 'Siti Rahayu',
      items: [{ sku: 'PROD-002', name: 'Teh Manis', qty: 1, price: 15000 }],
      total: 15000,
      status: 'payment_verified',
    },
  ]
}

// Stub: fetch orders from Shopee
async function fetchShopeeOrders(_config: any): Promise<any[]> {
  return [
    {
      externalId: `shopee-${Date.now()}`,
      customerName: 'Andi Wijaya',
      items: [{ sku: 'PROD-001', name: 'Kopi Susu', qty: 3, price: 25000 }],
      total: 75000,
      status: 'ready_to_ship',
    },
  ]
}

// Normalize channel-specific statuses to unified status
export function normalizeStatus(channel: string, rawStatus: string): string {
  const map: Record<string, Record<string, string>> = {
    WOOCOMMERCE: {
      pending: 'PENDING',
      processing: 'CONFIRMED',
      'on-hold': 'PENDING',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      failed: 'FAILED',
    },
    TOKOPEDIA: {
      waiting_payment: 'PENDING',
      payment_verified: 'CONFIRMED',
      seller_process: 'PROCESSING',
      ready_to_ship: 'PROCESSING',
      shipped: 'SHIPPED',
      delivered: 'COMPLETED',
      cancelled: 'CANCELLED',
    },
    SHOPEE: {
      unpaid: 'PENDING',
      ready_to_ship: 'CONFIRMED',
      processed: 'PROCESSING',
      shipped: 'SHIPPED',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      in_cancel: 'CANCELLED',
    },
    DIRECT: {
      pending: 'PENDING',
      confirmed: 'CONFIRMED',
      processing: 'PROCESSING',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
    },
  }
  return map[channel]?.[rawStatus] ?? 'PENDING'
}

// Deduct stock for synced order items
async function deductStock(storeId: string, items: any[]): Promise<void> {
  for (const item of items) {
    const sku: string = item.sku ?? ''
    const qty: number = Number(item.qty) || 0
    if (!sku || qty <= 0) continue

    // Try to find product by SKU or name
    const products = await query(
      `SELECT id, stock, trackStock FROM Product WHERE storeId = ? AND (sku = ? OR name = ?) LIMIT 1`,
      [storeId, sku, item.name ?? ''],
    )
    if ((products as any[]).length === 0) continue
    const product = (products as any[])[0]
    if (!product.trackStock) continue

    const newStock = Math.max(0, (Number(product.stock) || 0) - qty)
    await exec(
      `UPDATE Product SET stock = ? WHERE id = ?`,
      [newStock, product.id],
    )
  }
}

// POST /api/ecommerce/sync/:channel?storeId=xxx
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { channel } = await params
    const channelUpper = channel.toUpperCase()
    const VALID_CHANNELS = ['WOOCOMMERCE', 'TOKOPEDIA', 'SHOPEE', 'DIRECT']
    if (!VALID_CHANNELS.includes(channelUpper)) {
      return err(`Unknown channel: ${channel}`)
    }

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    // Get channel config
    const configs = await query(
      `SELECT * FROM ChannelConfig WHERE storeId = ? AND channel = ? AND active = 1`,
      [storeId, channelUpper],
    )
    const config = (configs as any[])[0] ?? null

    // Fetch remote orders (stub)
    let remoteOrders: any[] = []
    if (channelUpper === 'WOOCOMMERCE') remoteOrders = await fetchWooCommerceOrders(config)
    else if (channelUpper === 'TOKOPEDIA') remoteOrders = await fetchTokopediaOrders(config)
    else if (channelUpper === 'SHOPEE') remoteOrders = await fetchShopeeOrders(config)

    let imported = 0
    let skipped = 0

    for (const remote of remoteOrders) {
      // Duplicate prevention: check by channel + externalId
      const existing = await query(
        `SELECT id FROM OnlineOrder WHERE storeId = ? AND channel = ? AND externalId = ?`,
        [storeId, channelUpper, remote.externalId],
      )
      if ((existing as any[]).length > 0) {
        skipped++
        continue
      }

      const status = normalizeStatus(channelUpper, remote.status ?? '')
      const id = newId()
      const itemsJson = JSON.stringify(remote.items ?? [])

      await exec(
        `INSERT INTO OnlineOrder (id,storeId,channel,externalId,customerName,items,total,status,createdAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, storeId, channelUpper, remote.externalId, remote.customerName ?? '',
         itemsJson, Number(remote.total) || 0, status, nowISO()],
      )

      // Deduct stock
      await deductStock(storeId, remote.items ?? [])

      imported++
    }

    // Update lastSyncAt on config
    if (config) {
      await exec(
        `UPDATE ChannelConfig SET lastSyncAt = ?, updatedAt = ? WHERE id = ?`,
        [nowISO(), nowISO(), config.id],
      )
    }

    return ok({ channel: channelUpper, imported, skipped, total: remoteOrders.length })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
