import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, batchExec, newId, nowISO } from '@/lib/db'
import { postJournalEntry } from '@/lib/accounting'
import { logAudit, getAuditLogs } from '@/lib/audit'

function ok(data: any, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ─── Allowlists for PATCH column names (prevent SQL injection) ────────────────

const ALLOWED_PRODUCT_COLS = new Set([
  'name',
  'description',
  'sku',
  'barcode',
  'price',
  'cost',
  'categoryId',
  'trackStock',
  'stock',
  'lowStock',
  'active',
  'image',
])
const ALLOWED_CUSTOMER_COLS = new Set(['name', 'phone', 'email', 'address', 'points'])
const ALLOWED_DISCOUNT_COLS = new Set([
  'name',
  'code',
  'type',
  'value',
  'minOrder',
  'maxUses',
  'startsAt',
  'endsAt',
  'active',
])
const ALLOWED_STORE_COLS = new Set([
  'name',
  'address',
  'phone',
  'email',
  'taxRate',
  'currency',
  'timezone',
  'receiptNote',
  'modules',
])
const ALLOWED_USER_COLS = new Set(['name', 'email', 'password', 'role', 'active'])

function filterCols(body: Record<string, any>, allowed: Set<string>): Record<string, any> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)))
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

// ─── Verify caller owns the store ─────────────────────────────────────────────

function assertStoreAccess(user: any, storeId: string): boolean {
  return user.stores?.some((s: any) => s.id === storeId) ?? false
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(req, 'GET', path)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(req, 'POST', path)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(req, 'PATCH', path)
}
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return handle(req, 'DELETE', path)
}

async function handle(req: NextRequest, method: string, segs: string[]) {
  const url = new URL(req.url)
  const sp = url.searchParams

  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any
    const defaultStoreId = user.stores?.[0]?.id

    // ─── GLOBAL TENANT GUARD ──────────────────────────────────────────────────
    // Resolve storeId once for all routes. Public endpoints (register/login)
    // are handled in separate route files and never reach here.
    const storeId: string = url.searchParams.get('storeId') ?? defaultStoreId
    if (!storeId) return err('storeId required', 400)

    // ─── PRODUCTS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'products') {
      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('search') ?? ''
          const catId = sp.get('categoryId')
          let sql = `SELECT p.*, c.name as categoryName, c.color as categoryColor
                     FROM Product p LEFT JOIN Category c ON p.categoryId = c.id
                     WHERE p.storeId = ? AND p.active = 1`
          const p: any[] = [storeId]
          if (catId) {
            sql += ' AND p.categoryId = ?'
            p.push(catId)
          }
          if (search) {
            sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'
            p.push(`%${search}%`, `%${search}%`)
          }
          sql += ' ORDER BY p.name'
          return ok(await query(sql, p))
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || b.price === undefined) return err('name and price are required')
          const pid = newId()
          const t = nowISO()
          await exec(
            `INSERT INTO Product (id,storeId,name,price,description,sku,barcode,categoryId,cost,trackStock,stock,lowStock,active,image,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              pid,
              storeId,
              b.name,
              Number(b.price),
              b.description || null,
              b.sku || null,
              b.barcode || null,
              b.categoryId || null,
              Number(b.cost) || 0,
              b.trackStock ? 1 : 0,
              Number(b.stock) || 0,
              Number(b.lowStock) || 5,
              b.active !== false ? 1 : 0,
              b.image || null,
              t,
              t,
            ],
          )
          if ((Number(b.stock) || 0) > 0)
            await exec(
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [newId(), pid, 'INITIAL', Number(b.stock), 'Initial stock', t],
            )
          return ok({ id: pid, name: b.name, price: b.price }, 201)
        }
      }
      if (segs.length === 2) {
        const pid = segs[1]
        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_PRODUCT_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(
            `UPDATE Product SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...values, t, pid, storeId],
          )
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec('UPDATE Product SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?', [
            nowISO(),
            pid,
            storeId,
          ])
          return ok({ success: true })
        }
      }
    }

    // ─── PRODUCTS/RECENT ──────────────────────────────────────────────────────
    if (segs[0] === 'products' && segs[1] === 'recent' && method === 'GET') {
      const limit = Math.min(20, Math.max(1, parseInt(sp.get('limit') ?? '5')))
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()
      const rows = await query(
        `SELECT p.id, p.name, p.price, p.stock, p.trackStock, p.sku, p.barcode,
                p.image, p.categoryId,
                c.id as catId, c.name as catName, c.color as catColor, c.icon as catIcon,
                COUNT(oi.id) as soldQty
         FROM OrderItem oi
         JOIN "Order" o ON oi.orderId = o.id
         JOIN Product p ON oi.productId = p.id
         LEFT JOIN Category c ON p.categoryId = c.id
         WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt >= ? AND p.active = 1
         GROUP BY p.id
         ORDER BY soldQty DESC
         LIMIT ?`,
        [storeId, todayISO, limit],
      )
      return ok(
        rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          price: r.price,
          stock: r.stock,
          trackStock: r.trackStock,
          sku: r.sku,
          barcode: r.barcode,
          image: r.image,
          variants: [],
          category: r.catId
            ? { id: r.catId, name: r.catName, color: r.catColor, icon: r.catIcon }
            : null,
        })),
      )
    }

    // ─── CATEGORIES ───────────────────────────────────────────────────────────
    if (segs[0] === 'categories') {
      if (method === 'GET')
        return ok(
          await query(
            `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`,
            [storeId],
          ),
        )
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'orders') {
      if (segs.length === 1) {
        if (method === 'GET') {
          const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
          const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
          const offset = (page - 1) * limit
          const status = sp.get('status')
          const dateFrom = sp.get('dateFrom')
          const dateTo = sp.get('dateTo')
          // Validate status value against allowlist
          const validStatuses = new Set(['PAID', 'PENDING', 'VOIDED', 'REFUNDED'])
          let sql = `SELECT o.*, u.name as userName, c.name as customerName
                     FROM "Order" o LEFT JOIN User u ON o.userId = u.id
                     LEFT JOIN Customer c ON o.customerId = c.id WHERE o.storeId = ?`
          const p: any[] = [storeId]
          if (status && validStatuses.has(status)) {
            sql += ' AND o.status = ?'
            p.push(status)
          }
          if (dateFrom) {
            sql += ' AND o.createdAt >= ?'
            p.push(dateFrom)
          }
          if (dateTo) {
            sql += ' AND o.createdAt <= ?'
            p.push(dateTo)
          }
          sql += ' ORDER BY o.createdAt DESC LIMIT ? OFFSET ?'
          p.push(limit, offset)
          const orders = await query(sql, p)
          const enriched = await Promise.all(
            orders.map(async (o: any) => ({
              ...o,
              items: await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [o.id]),
              payments: await query(`SELECT * FROM Payment WHERE orderId = ?`, [o.id]),
            })),
          )
          return ok(enriched)
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.items?.length) return err('Order must have at least one item')
          if (!b.payments?.length) return err('Order must have at least one payment')
          const oid = newId()
          const t = nowISO()
          const number = `INV-${Date.now()}`
          const stmts: Array<{ sql: string; params: any[] }> = [
            {
              sql: `INSERT INTO "Order" (id,storeId,number,status,userId,customerId,discountId,subtotal,discountAmt,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              params: [
                oid,
                storeId,
                number,
                'PAID',
                user.id,
                b.customerId || null,
                b.discountId || null,
                Number(b.subtotal) || 0,
                Number(b.discountAmt) || 0,
                Number(b.taxAmt) || 0,
                Number(b.total) || 0,
                b.note || null,
                t,
                t,
              ],
            },
          ]
          for (const item of b.items || []) {
            stmts.push({
              sql: `INSERT INTO OrderItem (id,orderId,productId,variantId,name,variantName,price,qty,discount,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [
                newId(),
                oid,
                item.productId,
                item.variantId || null,
                item.name,
                item.variantName || null,
                Number(item.price),
                Number(item.qty),
                Number(item.discount) || 0,
                Number(item.subtotal),
              ],
            })
            if (item.productId) {
              stmts.push({
                sql: `UPDATE Product SET stock = stock - ? WHERE id = ? AND storeId = ?`,
                params: [Number(item.qty), item.productId, storeId],
              })
              stmts.push({
                sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
                params: [newId(), item.productId, 'SALE', -Number(item.qty), `Order ${number}`, t],
              })
            }
          }
          const validPayMethods = new Set(['CASH', 'CARD', 'TRANSFER', 'QRIS', 'OTHER'])
          for (const pay of b.payments || []) {
            if (!validPayMethods.has(pay.method)) continue
            stmts.push({
              sql: `INSERT INTO Payment (id,orderId,method,amount,reference,change,createdAt) VALUES (?,?,?,?,?,?,?)`,
              params: [
                newId(),
                oid,
                pay.method,
                Number(pay.amount),
                pay.reference || null,
                Number(pay.change) || 0,
                t,
              ],
            })
          }
          await batchExec(stmts)
          // ── Audit log ────────────────────────────────────────────────────
          logAudit({
            storeId,
            userId: user.id,
            action: 'ORDER_CREATE',
            resourceType: 'Order',
            resourceId: oid,
            meta: { number, total: Number(b.total) || 0 },
          }).catch(() => {})
          // ── Auto-post journal entry for the sale ─────────────────────────
          // Determine debit account: Cash (1100) for CASH payments, AR (1200) otherwise
          const primaryPayment = (b.payments as any[])[0]
          const debitCode = primaryPayment?.method === 'CASH' ? '1100' : '1200'
          await postJournalEntry(storeId, `Sale #${number}`, [
            { accountCode: debitCode, debit: Number(b.total) || 0, credit: 0 },
            { accountCode: '4100', debit: 0, credit: Number(b.total) || 0 },
          ])
          // ── Points: award earned, subtract redeemed ──────────────────────
          let pointsEarned = 0
          if (b.customerId) {
            const redeemed = Math.max(0, Number(b.pointsRedeemed) || 0)
            pointsEarned = Math.floor(Number(b.total) / 1000)
            const net = pointsEarned - redeemed
            if (net !== 0) {
              await exec(
                `UPDATE Customer SET points = MAX(0, points + ?), updatedAt = ? WHERE id = ? AND storeId = ?`,
                [net, t, b.customerId, storeId],
              )
            }
          }
          // Return full order with items and payments for receipt display
          const orderItems = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
          const orderPayments = await query(`SELECT * FROM Payment WHERE orderId = ?`, [oid])
          return ok(
            {
              id: oid,
              number,
              status: 'PAID',
              pointsEarned,
              createdAt: t,
              subtotal: Number(b.subtotal) || 0,
              taxAmt: Number(b.taxAmt) || 0,
              discountAmt: Number(b.discountAmt) || 0,
              total: Number(b.total) || 0,
              items: orderItems,
              payments: orderPayments,
            },
            201,
          )
        }
      }
      if (segs.length === 3 && segs[2] === 'void' && method === 'POST') {
        const oid = segs[1]
        const order = await queryOne(`SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [
          oid,
          storeId,
        ])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PAID') return err('Only PAID orders can be voided', 400)
        const items = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
        const t = nowISO()
        const stmts: Array<{ sql: string; params: any[] }> = [
          {
            sql: `UPDATE "Order" SET status = 'VOIDED', updatedAt = ? WHERE id = ?`,
            params: [t, oid],
          },
        ]
        for (const item of items) {
          stmts.push({
            sql: `UPDATE Product SET stock = stock + ? WHERE id = ?`,
            params: [item.qty, item.productId],
          })
          stmts.push({
            sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
            params: [newId(), item.productId, 'VOID', item.qty, `Void ${order.number}`, t],
          })
        }
        await batchExec(stmts)
        return ok({ success: true, status: 'VOIDED' })
      }

      // ── GET /api/orders/:id — fetch single order with items and payments ──────
      if (segs.length === 2 && method === 'GET') {
        const oid = segs[1]
        const order = await queryOne(
          `SELECT o.*, u.name as userName, c.name as customerName
           FROM "Order" o
           LEFT JOIN User u ON o.userId = u.id
           LEFT JOIN Customer c ON o.customerId = c.id
           WHERE o.id = ? AND o.storeId = ?`,
          [oid, storeId],
        )
        if (!order) return err('Order not found', 404)
        const [items, payments] = await Promise.all([
          query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid]),
          query(`SELECT * FROM Payment WHERE orderId = ?`, [oid]),
        ])
        return ok({ ...order, items, payments })
      }

      // ── PATCH /api/orders/:id — update status (refund), restores stock ────────
      if (segs.length === 2 && method === 'PATCH') {
        const oid = segs[1]
        // Only OWNER and MANAGER may refund
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)

        const b: any = await req.json()
        const validStatuses = new Set(['REFUNDED'])
        if (!b.status || !validStatuses.has(b.status)) return err('Invalid status value', 400)

        const order = await queryOne(`SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [
          oid,
          storeId,
        ])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PAID') return err('Only PAID orders can be refunded', 400)

        const items = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
        const t = nowISO()
        const stmts: Array<{ sql: string; params: any[] }> = [
          {
            sql: `UPDATE "Order" SET status = 'REFUNDED', updatedAt = ? WHERE id = ?`,
            params: [t, oid],
          },
        ]
        for (const item of items) {
          if (item.productId) {
            stmts.push({
              sql: `UPDATE Product SET stock = stock + ? WHERE id = ? AND storeId = ?`,
              params: [item.qty, item.productId, storeId],
            })
            stmts.push({
              sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              params: [newId(), item.productId, 'REFUND', item.qty, `Refund ${order.number}`, t],
            })
          }
        }
        await batchExec(stmts)
        // ── Audit log ────────────────────────────────────────────────────
        logAudit({
          storeId,
          userId: user.id,
          action: 'ORDER_REFUND',
          resourceType: 'Order',
          resourceId: oid,
          meta: { number: order.number },
        }).catch(() => {})
        return ok({ success: true, status: 'REFUNDED' })
      }
    }

    // ─── CUSTOMERS ────────────────────────────────────────────────────────────
    if (segs[0] === 'customers') {
      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('q') ?? ''
          const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
          const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
          let sql = `SELECT * FROM Customer WHERE storeId = ?`
          const p: any[] = [storeId]
          if (search) {
            sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`
            p.push(`%${search}%`, `%${search}%`, `%${search}%`)
          }
          sql += ' ORDER BY name LIMIT ? OFFSET ?'
          p.push(limit, (page - 1) * limit)
          return ok(await query(sql, p))
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name) return err('name is required')
          const cid = newId()
          const t = nowISO()
          await exec(
            `INSERT INTO Customer (id,storeId,name,phone,email,address,points,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`,
            [cid, storeId, b.name, b.phone || null, b.email || null, b.address || null, 0, t, t],
          )
          return ok({ id: cid, name: b.name }, 201)
        }
      }
      if (segs.length === 2) {
        const cid = segs[1]
        if (method === 'GET') {
          const customer = await queryOne(`SELECT * FROM Customer WHERE id = ? AND storeId = ?`, [
            cid,
            storeId,
          ])
          if (!customer) return err('Not found', 404)
          return ok(customer)
        }
        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_CUSTOMER_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(
            `UPDATE Customer SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...values, t, cid, storeId],
          )
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          const cnt: any = await queryOne(
            `SELECT COUNT(*) as c FROM "Order" WHERE customerId = ?`,
            [cid],
          )
          if ((cnt?.c ?? 0) > 0) return err('Cannot delete customer with orders', 400)
          await exec(`DELETE FROM Customer WHERE id = ? AND storeId = ?`, [cid, storeId])
          return ok({ success: true })
        }
      }

      // ── GET /api/customers/:id/orders ──────────────────────────────────────
      if (segs.length === 3 && segs[2] === 'orders' && method === 'GET') {
        const cid = segs[1]
        // Verify customer belongs to this store
        const customer = await queryOne(`SELECT id FROM Customer WHERE id = ? AND storeId = ?`, [
          cid,
          storeId,
        ])
        if (!customer) return err('Customer not found', 404)
        const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
        const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
        const orders = await query(
          `SELECT o.id, o.number, o.status, o.total, o.subtotal, o.discountAmt, o.taxAmt, o.note, o.createdAt
           FROM "Order" o
           WHERE o.customerId = ? AND o.storeId = ?
           ORDER BY o.createdAt DESC LIMIT ? OFFSET ?`,
          [cid, storeId, limit, (page - 1) * limit],
        )
        return ok(orders)
      }

      // ── GET /api/customers/:id/points ──────────────────────────────────────
      if (segs.length === 3 && segs[2] === 'points' && method === 'GET') {
        const cid = segs[1]
        // Verify customer belongs to this store
        const customer = await queryOne(`SELECT id FROM Customer WHERE id = ? AND storeId = ?`, [
          cid,
          storeId,
        ])
        if (!customer) return err('Customer not found', 404)
        const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
        const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50')))
        // Try LoyaltyRedemption table; fall back gracefully if it doesn't exist
        let history: any[] = []
        try {
          history = await query(
            `SELECT id, type, points, note, orderId, createdAt
             FROM LoyaltyRedemption
             WHERE customerId = ?
             ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
            [cid, limit, (page - 1) * limit],
          )
        } catch {
          // Table may not exist yet — return empty array rather than 500
          history = []
        }
        return ok(history)
      }
    }

    // ─── INVENTORY ────────────────────────────────────────────────────────────
    if (segs[0] === 'inventory') {
      // Bulk CSV stock adjustment — POST /api/inventory/bulk-adjust
      if (segs[1] === 'bulk-adjust' && method === 'POST') {
        const b = (await req.json()) as {
          storeId?: string
          sku?: string
          adjustment?: number
          note?: string
        }
        const sid = b.storeId ?? storeId
        if (!b.sku) return err('sku required')
        if (typeof b.adjustment !== 'number') return err('adjustment must be a number')
        const product = await queryOne<any>(
          `SELECT * FROM Product WHERE sku = ? AND storeId = ? AND trackStock = 1`,
          [b.sku, sid],
        )
        if (!product) return err(`SKU tidak ditemukan: ${b.sku}`)
        const newStock = product.stock + b.adjustment
        if (newStock < 0)
          return err(`Stok tidak cukup: ${product.name} (saat ini ${product.stock})`)
        const t = nowISO()
        await exec(`UPDATE Product SET stock = ?, updatedAt = ? WHERE id = ?`, [
          newStock,
          t,
          product.id,
        ])
        await exec(
          `INSERT INTO StockLog (id, productId, storeId, type, quantity, note, createdAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            product.id,
            sid,
            b.adjustment >= 0 ? 'IN' : 'OUT',
            Math.abs(b.adjustment),
            b.note ?? 'Bulk import',
            t,
          ],
        )
        // ── Audit log ────────────────────────────────────────────────────
        logAudit({
          storeId: sid,
          userId: user.id,
          action: 'STOCK_ADJUST',
          resourceType: 'Product',
          resourceId: product.id,
          meta: { sku: b.sku, adjustment: b.adjustment, note: b.note },
        }).catch(() => {})
        return ok({ success: true, productName: product.name, newStock })
      }

      if (segs.length === 1 && method === 'GET') {
        const lowStockOnly = sp.get('lowStockOnly') === 'true'
        let sql = `SELECT p.*, c.name as categoryName FROM Product p LEFT JOIN Category c ON p.categoryId = c.id WHERE p.storeId = ? AND p.trackStock = 1`
        if (lowStockOnly) sql += ' AND p.stock <= p.lowStock'
        return ok(await query(sql + ' ORDER BY p.stock ASC', [storeId]))
      }
      if (segs.length === 3 && segs[2] === 'adjust' && method === 'POST') {
        const b: any = await req.json()
        const validTypes = new Set(['IN', 'OUT', 'ADJUSTMENT', 'INITIAL'])
        if (!validTypes.has(b.type)) return err('Invalid adjustment type')
        const pid = segs[1]
        const t = nowISO()
        // Verify product belongs to store
        const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [
          pid,
          storeId,
        ])
        if (!product) return err('Product not found', 404)
        await exec(
          `UPDATE Product SET stock = stock + ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
          [Number(b.qty), t, pid, storeId],
        )
        await exec(
          `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
          [newId(), pid, b.type, Number(b.qty), b.note || null, t],
        )
        return ok(await queryOne(`SELECT * FROM Product WHERE id = ?`, [pid]))
      }
      if (segs.length === 3 && segs[2] === 'logs' && method === 'GET') {
        // Verify product belongs to store
        const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [
          segs[1],
          storeId,
        ])
        if (!product) return err('Product not found', 404)
        return ok(
          await query(
            `SELECT * FROM StockLog WHERE productId = ? ORDER BY createdAt DESC LIMIT 50`,
            [segs[1]],
          ),
        )
      }

      // GET /api/inventory/:id/history?days=30
      if (segs.length === 3 && segs[2] === 'history' && method === 'GET') {
        const pid = segs[1]
        const days = Math.min(Math.max(parseInt(sp.get('days') ?? '30', 10) || 30, 1), 90)
        // Verify product belongs to store
        const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [
          pid,
          storeId,
        ])
        if (!product) return err('Product not found', 404)
        // Build date range: last `days` days inclusive of today
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - (days - 1))
        cutoff.setHours(0, 0, 0, 0)
        const cutoffISO = cutoff.toISOString()
        const logs = await query<{ type: string; qty: number; createdAt: string }>(
          `SELECT type, qty, createdAt FROM StockLog WHERE productId = ? AND createdAt >= ? ORDER BY createdAt ASC`,
          [pid, cutoffISO],
        )
        // Aggregate by date string (YYYY-MM-DD)
        const map = new Map<string, { date: string; in: number; out: number }>()
        // Pre-fill all days so chart has continuous axis
        for (let i = 0; i < days; i++) {
          const d = new Date(cutoff)
          d.setDate(d.getDate() + i)
          const key = d.toISOString().slice(0, 10)
          map.set(key, { date: key, in: 0, out: 0 })
        }
        for (const log of logs) {
          const key = log.createdAt.slice(0, 10)
          const entry = map.get(key)
          if (!entry) continue
          const absQty = Math.abs(Number(log.qty))
          // SALE, OUT, VOID have negative qty or OUT type; everything else is in
          const isOut =
            log.type === 'SALE' ||
            log.type === 'OUT' ||
            log.type === 'VOID' ||
            log.type === 'REFUND'
              ? false // REFUND adds back stock = in
              : Number(log.qty) < 0
          if (
            log.type === 'SALE' ||
            log.type === 'OUT' ||
            (Number(log.qty) < 0 && log.type === 'ADJUSTMENT')
          ) {
            entry.out += absQty
          } else {
            entry.in += absQty
          }
        }
        return ok(Array.from(map.values()))
      }
    }

    // ─── DISCOUNTS ────────────────────────────────────────────────────────────
    if (segs[0] === 'discounts') {
      if (segs.length === 1) {
        if (method === 'GET')
          return ok(
            await query(`SELECT * FROM Discount WHERE storeId = ? ORDER BY createdAt DESC`, [
              storeId,
            ]),
          )
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || !b.type || b.value === undefined)
            return err('name, type and value are required')
          const validTypes = new Set(['PERCENTAGE', 'FIXED'])
          if (!validTypes.has(b.type)) return err('Invalid discount type')
          const did = newId()
          const t = nowISO()
          await exec(
            `INSERT INTO Discount (id,storeId,name,code,type,value,minOrder,maxUses,usedCount,startsAt,endsAt,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              did,
              storeId,
              b.name,
              b.code || null,
              b.type,
              Number(b.value),
              Number(b.minOrder) || 0,
              b.maxUses || null,
              0,
              b.startsAt || null,
              b.endsAt || null,
              1,
              t,
              t,
            ],
          )
          return ok({ id: did, name: b.name }, 201)
        }
      }
      if (segs.length === 2) {
        const did = segs[1]
        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_DISCOUNT_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(
            `UPDATE Discount SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...values, t, did, storeId],
          )
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec(`UPDATE Discount SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?`, [
            nowISO(),
            did,
            storeId,
          ])
          return ok({ success: true })
        }
      }
    }

    // ─── STAFF ────────────────────────────────────────────────────────────────
    if (segs[0] === 'staff') {
      // Only OWNER or MANAGER can manage staff
      const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
      if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET')
          return ok(
            await query(
              `SELECT u.id, u.name, u.email, u.role, u.active, su.role as storeRole FROM User u
           JOIN StoreUser su ON u.id = su.userId WHERE su.storeId = ? ORDER BY u.name`,
              [storeId],
            ),
          )
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || !b.email || !b.password)
            return err('name, email and password are required')
          const validRoles = new Set(['MANAGER', 'CASHIER'])
          if (b.role && !validRoles.has(b.role)) return err('Invalid role')
          const existing = await queryOne(`SELECT id FROM User WHERE email = ?`, [b.email])
          if (existing) return err('Email already in use', 409)
          const uid = newId()
          const t = nowISO()
          const bcryptLib = await import('bcryptjs')
          const pwd = await bcryptLib.hash(b.password, 10)
          await batchExec([
            {
              sql: `INSERT INTO User (id,tenantId,name,email,password,role,active,isSuperAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [
                uid,
                user.tenantId || null,
                b.name,
                b.email,
                pwd,
                b.role || 'CASHIER',
                1,
                0,
                t,
                t,
              ],
            },
            {
              sql: `INSERT INTO StoreUser (id,storeId,userId,role) VALUES (?,?,?,?)`,
              params: [newId(), storeId, uid, b.role || 'CASHIER'],
            },
          ])
          return ok({ id: uid, name: b.name, email: b.email, role: b.role || 'CASHIER' }, 201)
        }
      }
      if (segs.length === 2) {
        const uid = segs[1]
        // Verify target user belongs to same store
        const membership = await queryOne(
          `SELECT role FROM StoreUser WHERE userId = ? AND storeId = ?`,
          [uid, storeId],
        )
        if (!membership) return err('Staff member not found', 404)
        // OWNER cannot be modified by MANAGER
        if (membership.role === 'OWNER' && callerRole !== 'OWNER') return err('Forbidden', 403)

        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_USER_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          if (b.password) {
            const bcryptLib = await import('bcryptjs')
            b.password = await bcryptLib.hash(String(b.password), 10)
          }
          if (b.role) {
            const validRoles = new Set(['MANAGER', 'CASHIER'])
            if (!validRoles.has(b.role)) return err('Invalid role')
          }
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(`UPDATE User SET ${setClauses}, updatedAt = ? WHERE id = ?`, [
            ...values,
            t,
            uid,
          ])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec(`UPDATE User SET active = 0, updatedAt = ? WHERE id = ?`, [nowISO(), uid])
          return ok({ success: true })
        }
      }
    }

    // ─── SETTINGS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'settings' && segs[1] === 'store') {
      // Only OWNER can update store settings
      const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
      if (method === 'GET') return ok(await queryOne(`SELECT * FROM Store WHERE id = ?`, [storeId]))
      if (method === 'PATCH') {
        if (callerRole !== 'OWNER') return err('Forbidden', 403)
        const raw: any = await req.json()
        const b = filterCols(raw, ALLOWED_STORE_COLS)
        if (Object.keys(b).length === 0) return err('No valid fields to update')
        const t = nowISO()
        const { setClauses, values } = buildUpdate(b)
        await exec(`UPDATE Store SET ${setClauses}, updatedAt = ? WHERE id = ?`, [
          ...values,
          t,
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ─── REPORTS ──────────────────────────────────────────────────────────────
    // ─── REPORTS / FORECAST ──────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'forecast' && method === 'GET') {
      const days = Math.min(90, Math.max(7, parseInt(sp.get('days') ?? '30')))
      const since = new Date(Date.now() - 86400000 * days).toISOString()
      const rows = await query(
        `SELECT DATE(createdAt) as date, SUM(total) as revenue
         FROM "Order"
         WHERE storeId=? AND status='PAID' AND createdAt >= ?
         GROUP BY DATE(createdAt)
         ORDER BY date`,
        [storeId, since],
      )
      return ok(
        (rows as any[]).map((r: any) => ({
          date: r.date,
          revenue: Number(r.revenue),
        })),
      )
    }

    // ─── REPORTS / COHORT ────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'cohort' && method === 'GET') {
      // First purchase month per customer
      const firstPurchaseRaw = await query(
        `SELECT customerId,
                strftime('%Y-%m', MIN(createdAt)) as cohort,
                MIN(createdAt) as firstAt
         FROM "Order"
         WHERE storeId=? AND status='PAID' AND customerId IS NOT NULL
         GROUP BY customerId`,
        [storeId],
      )

      // All purchases per customer
      const allPurchasesRaw = await query(
        `SELECT customerId, strftime('%Y-%m', createdAt) as month
         FROM "Order"
         WHERE storeId=? AND status='PAID' AND customerId IS NOT NULL`,
        [storeId],
      )

      // Build cohort map: cohort -> Set<customerId>
      const cohortMap = new Map<string, Set<string>>()
      for (const r of firstPurchaseRaw as any[]) {
        if (!cohortMap.has(r.cohort)) cohortMap.set(r.cohort, new Set())
        cohortMap.get(r.cohort)!.add(r.customerId)
      }

      // Build customer -> first cohort month map
      const customerCohort = new Map<string, string>()
      for (const r of firstPurchaseRaw as any[]) {
        customerCohort.set(r.customerId, r.cohort)
      }

      // Build purchase set: customerId+month -> true
      const purchaseSet = new Set<string>()
      for (const r of allPurchasesRaw as any[]) {
        purchaseSet.add(`${r.customerId}|${r.month}`)
      }

      // For each cohort, compute retention for months 0-6
      const cohortRows = Array.from(cohortMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cohort, customers]) => {
          const [cy, cm] = cohort.split('-').map(Number)
          const retention: number[] = []
          for (let offset = 0; offset <= 6; offset++) {
            const targetDate = new Date(cy, cm - 1 + offset, 1)
            const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
            let active = 0
            for (const cid of customers) {
              if (purchaseSet.has(`${cid}|${targetMonth}`)) active++
            }
            retention.push(customers.size > 0 ? (active / customers.size) * 100 : 0)
          }
          return { cohort, customers: customers.size, retention }
        })

      return ok({ rows: cohortRows })
    }

    // ─── REPORTS / CLV ───────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'clv' && method === 'GET') {
      // Per-customer order stats
      const custStats = await query(
        `SELECT customerId,
                COUNT(*) as orderCount,
                AVG(total) as avgOrder,
                MIN(createdAt) as firstAt,
                MAX(createdAt) as lastAt
         FROM "Order"
         WHERE storeId=? AND status='PAID' AND customerId IS NOT NULL
         GROUP BY customerId
         HAVING orderCount >= 1`,
        [storeId],
      )

      if ((custStats as any[]).length === 0) {
        return ok({ avgOrderValue: 0, avgOrdersPerMonth: 0, avgMonthsActive: 0, clv: 0 })
      }

      let totalAvgOrder = 0
      let totalOrdersPerMonth = 0
      let totalMonthsActive = 0
      const n = (custStats as any[]).length

      for (const r of custStats as any[]) {
        totalAvgOrder += Number(r.avgOrder)
        const first = new Date(r.firstAt)
        const last = new Date(r.lastAt)
        const monthsActive = Math.max(
          1,
          (last.getFullYear() - first.getFullYear()) * 12 +
            (last.getMonth() - first.getMonth()) +
            1,
        )
        totalMonthsActive += monthsActive
        totalOrdersPerMonth += Number(r.orderCount) / monthsActive
      }

      const avgOrderValue = totalAvgOrder / n
      const avgOrdersPerMonth = totalOrdersPerMonth / n
      const avgMonthsActive = totalMonthsActive / n
      const clv = avgOrderValue * avgOrdersPerMonth * avgMonthsActive

      return ok({ avgOrderValue, avgOrdersPerMonth, avgMonthsActive, clv })
    }

    if (segs[0] === 'reports' && segs[1] === 'summary' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()
      const [revenue, daily, topProducts, payments, customers, expenses] = await Promise.all([
        queryOne(
          `SELECT SUM(total) as totalRevenue, COUNT(*) as totalOrders, AVG(total) as avgOrderValue FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`,
          [storeId, from, to],
        ),
        query(
          `SELECT DATE(createdAt) as date, SUM(total) as total, COUNT(*) as orders FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY date`,
          [storeId, from, to],
        ),
        query(
          `SELECT oi.name, SUM(oi.subtotal) as revenue, SUM(oi.qty) as qty FROM OrderItem oi JOIN "Order" o ON oi.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY oi.name ORDER BY revenue DESC LIMIT 5`,
          [storeId, from, to],
        ),
        query(
          `SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY p.method`,
          [storeId, from, to],
        ),
        queryOne(
          `SELECT COUNT(*) as newCustomers FROM Customer WHERE storeId=? AND createdAt BETWEEN ? AND ?`,
          [storeId, from, to],
        ),
        queryOne(
          `SELECT COALESCE(SUM(amount),0) as totalExpenses FROM Expense WHERE storeId=? AND date BETWEEN ? AND ?`,
          [storeId, from.slice(0, 10), to.slice(0, 10)],
        ),
      ])
      const totalRevenue = (revenue as any)?.totalRevenue ?? 0
      const totalExpenses = (expenses as any)?.totalExpenses ?? 0
      return ok({
        totalRevenue,
        totalOrders: (revenue as any)?.totalOrders ?? 0,
        avgOrderValue: (revenue as any)?.avgOrderValue ?? 0,
        newCustomers: (customers as any)?.newCustomers ?? 0,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        dailySales: daily,
        topProducts,
        paymentBreakdown: payments,
      })
    }

    // ─── REPORTS / GROSS PROFIT ───────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'gross-profit' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()
      const [revenueRow, cogsRow] = await Promise.all([
        queryOne(
          `SELECT COALESCE(SUM(total),0) as revenue FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`,
          [storeId, from, to],
        ),
        queryOne(
          `SELECT COALESCE(SUM(oi.qty * COALESCE(p.cost,0)),0) as cogs
           FROM OrderItem oi
           JOIN "Order" o ON oi.orderId=o.id
           LEFT JOIN Product p ON oi.productId=p.id
           WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ?`,
          [storeId, from, to],
        ),
      ])
      const revenue = Number((revenueRow as any)?.revenue ?? 0)
      const cogs = Number((cogsRow as any)?.cogs ?? 0)
      const grossProfit = revenue - cogs
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
      return ok({ revenue, cogs, grossProfit, grossMargin })
    }

    // ─── REPORTS / ANALYTICS ──────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'analytics' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()

      const [hourlyRaw, dowRaw, categoryRaw, paymentRaw, newCustRaw, returningRaw] =
        await Promise.all([
          // Revenue & orders grouped by hour-of-day (0-23)
          query(
            `SELECT CAST(strftime('%H', createdAt) AS INTEGER) as hour,
                  SUM(total) as revenue, COUNT(*) as orders
           FROM "Order"
           WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?
           GROUP BY hour ORDER BY hour`,
            [storeId, from, to],
          ),
          // Revenue & orders grouped by day-of-week (0=Sun … 6=Sat in SQLite)
          query(
            `SELECT CAST(strftime('%w', createdAt) AS INTEGER) as dow,
                  SUM(total) as revenue, COUNT(*) as orders
           FROM "Order"
           WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?
           GROUP BY dow ORDER BY dow`,
            [storeId, from, to],
          ),
          // Revenue grouped by product category
          query(
            `SELECT COALESCE(c.name, 'Uncategorized') as category,
                  SUM(oi.subtotal) as revenue
           FROM OrderItem oi
           JOIN "Order" o ON oi.orderId = o.id
           LEFT JOIN Product p ON oi.productId = p.id
           LEFT JOIN Category c ON p.categoryId = c.id
           WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ?
           GROUP BY category ORDER BY revenue DESC`,
            [storeId, from, to],
          ),
          // Payment method breakdown
          query(
            `SELECT pm.method, SUM(pm.amount) as total, COUNT(*) as count
           FROM Payment pm
           JOIN "Order" o ON pm.orderId = o.id
           WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ?
           GROUP BY pm.method`,
            [storeId, from, to],
          ),
          // New customers (created in range)
          queryOne(
            `SELECT COUNT(*) as cnt FROM Customer WHERE storeId=? AND createdAt BETWEEN ? AND ?`,
            [storeId, from, to],
          ),
          // Returning customers (had ≥1 order before the range AND ≥1 order in range)
          queryOne(
            `SELECT COUNT(DISTINCT o.customerId) as cnt
           FROM "Order" o
           WHERE o.storeId=? AND o.status='PAID'
             AND o.customerId IS NOT NULL
             AND o.createdAt BETWEEN ? AND ?
             AND EXISTS (
               SELECT 1 FROM "Order" o2
               WHERE o2.customerId = o.customerId
                 AND o2.storeId = o.storeId
                 AND o2.status = 'PAID'
                 AND o2.createdAt < ?
             )`,
            [storeId, from, to, from],
          ),
        ])

      // Build full 0-23 hourly array, filling missing hours with zeros
      const hourMap = new Map((hourlyRaw as any[]).map((r: any) => [r.hour, r]))
      const hourlyData = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        revenue: Number(hourMap.get(h)?.revenue ?? 0),
        orders: Number(hourMap.get(h)?.orders ?? 0),
      }))

      // Map SQLite dow (0=Sun) to short day names
      const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dowMap = new Map((dowRaw as any[]).map((r: any) => [r.dow, r]))
      const dayOfWeekData = DOW_NAMES.map((day, i) => ({
        day,
        revenue: Number(dowMap.get(i)?.revenue ?? 0),
        orders: Number(dowMap.get(i)?.orders ?? 0),
      }))

      // Category breakdown with pct
      const catRows = categoryRaw as any[]
      const totalCatRevenue = catRows.reduce((s: number, r: any) => s + Number(r.revenue), 0)
      const categoryBreakdown = catRows.map((r: any) => ({
        category: r.category,
        revenue: Number(r.revenue),
        pct: totalCatRevenue > 0 ? (Number(r.revenue) / totalCatRevenue) * 100 : 0,
      }))

      // Payment methods
      const paymentMethods = (paymentRaw as any[]).map((r: any) => ({
        method: r.method,
        total: Number(r.total),
        count: Number(r.count),
      }))

      // Customer stats
      const newCustomers = Number((newCustRaw as any)?.cnt ?? 0)
      const returningCustomers = Number((returningRaw as any)?.cnt ?? 0)
      const totalWithOrders = newCustomers + returningCustomers
      const retentionRate = totalWithOrders > 0 ? (returningCustomers / totalWithOrders) * 100 : 0

      return ok({
        hourlyData,
        dayOfWeekData,
        categoryBreakdown,
        customerStats: { newCustomers, returningCustomers, retentionRate },
        paymentMethods,
      })
    }

    // ─── EXPENSES ─────────────────────────────────────────────────────────────
    if (segs[0] === 'expenses') {
      if (method === 'GET') {
        const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
        const to = sp.get('to') ?? new Date().toISOString()
        const rows = await query(
          `SELECT * FROM Expense WHERE storeId=? AND date BETWEEN ? AND ? ORDER BY date DESC, createdAt DESC`,
          [storeId, from.slice(0, 10), to.slice(0, 10)],
        )
        return ok(rows)
      }
      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.description || !b.amount || !b.date) return err('Missing required fields')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO Expense (id,storeId,userId,category,description,amount,date,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            user.id,
            b.category ?? 'Lain-lain',
            b.description,
            Number(b.amount),
            b.date,
            b.note ?? null,
            t,
            t,
          ],
        )
        // ── Auto-post journal entry for the expense ───────────────────────
        await postJournalEntry(storeId, `Expense: ${b.description}`, [
          { accountCode: '5200', debit: Number(b.amount) || 0, credit: 0 },
          { accountCode: '1100', debit: 0, credit: Number(b.amount) || 0 },
        ])
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set(['category', 'description', 'amount', 'date', 'note'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Expense SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`DELETE FROM Expense WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ─── SHIFTS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'shifts') {
      if (method === 'GET') {
        if (sp.get('active') === 'true') {
          const shift = await queryOne(
            `SELECT * FROM Shift WHERE storeId=? AND status='OPEN' ORDER BY openedAt DESC LIMIT 1`,
            [storeId],
          )
          return ok(shift ?? null)
        }
        const rows = await query(
          `SELECT s.*, u.name as userName FROM Shift s JOIN User u ON s.userId=u.id WHERE s.storeId=? ORDER BY s.openedAt DESC LIMIT 30`,
          [storeId],
        )
        return ok(rows)
      }
      if (method === 'POST') {
        // Open a new shift
        const b = (await req.json()) as any
        // Close any existing open shift first
        await exec(
          `UPDATE Shift SET status='CLOSED', closedAt=?, updatedAt=? WHERE storeId=? AND status='OPEN'`,
          [nowISO(), nowISO(), storeId],
        )
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO Shift (id,storeId,userId,openingCash,status,openedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`,
          [id, storeId, user.id, Number(b.openingCash ?? 0), 'OPEN', t, t, t],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && segs[2] === 'summary' && method === 'GET') {
        // GET /api/shifts/:id/summary — end-of-day report
        const shift = await queryOne<any>(
          `SELECT s.*, u.name as userName FROM Shift s JOIN User u ON s.userId=u.id WHERE s.id=? AND s.storeId=?`,
          [segs[1], storeId],
        )
        if (!shift) return err('Shift not found', 404)

        const closedAt = shift.closedAt ?? nowISO()

        // Total sales (all methods) during shift
        const salesRows = await query<any>(
          `SELECT p.method, COALESCE(SUM(p.amount),0) as total FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt >= ? AND o.createdAt <= ? GROUP BY p.method`,
          [storeId, shift.openedAt, closedAt],
        )
        const totalSales = salesRows.reduce((s: number, r: any) => s + Number(r.total), 0)
        const paymentBreakdown = Object.fromEntries(
          salesRows.map((r: any) => [r.method, Number(r.total)]),
        )

        // Total expenses during shift
        const expRow = await queryOne<any>(
          `SELECT COALESCE(SUM(amount),0) as total FROM Expense WHERE storeId=? AND date >= ? AND date <= ?`,
          [storeId, shift.openedAt.slice(0, 10), closedAt.slice(0, 10)],
        )
        const totalExpenses = Number(expRow?.total ?? 0)

        const openingCash = shift.openingCash ?? 0
        const closingCash = shift.closingCash ?? 0
        const cashSales = Number(paymentBreakdown['CASH'] ?? 0)
        const netCashFlow = cashSales - totalExpenses
        const expectedCash = openingCash + netCashFlow
        const cashVariance = closingCash - expectedCash

        // Duration in minutes
        const openedMs = new Date(shift.openedAt).getTime()
        const closedMs = new Date(closedAt).getTime()
        const durationMinutes = Math.round((closedMs - openedMs) / 60_000)

        return ok({
          shift,
          openingCash,
          closingCash,
          totalSales,
          totalExpenses,
          netCashFlow,
          expectedCash,
          cashVariance,
          paymentBreakdown,
          durationMinutes,
        })
      }

      if (segs[1] && method === 'PATCH') {
        // Close shift
        const b = (await req.json()) as any
        const shift = await queryOne<any>(`SELECT * FROM Shift WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!shift) return err('Shift not found', 404)
        const cashRevenue = await queryOne<any>(
          `SELECT COALESCE(SUM(p.amount),0) as total FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND p.method='CASH' AND o.createdAt >= ?`,
          [storeId, shift.openedAt],
        )
        const expectedCash = (shift.openingCash ?? 0) + (cashRevenue?.total ?? 0)
        await exec(
          `UPDATE Shift SET status=?,closedAt=?,closingCash=?,expectedCash=?,note=?,updatedAt=? WHERE id=? AND storeId=?`,
          [
            'CLOSED',
            nowISO(),
            Number(b.closingCash ?? 0),
            expectedCash,
            b.note ?? null,
            nowISO(),
            segs[1],
            storeId,
          ],
        )
        return ok({ success: true, expectedCash })
      }
    }

    // ─── VARIANTS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'variants') {
      const productId = sp.get('productId')
      if (method === 'GET') {
        if (!productId) return err('productId required')
        const rows = await query(
          `SELECT * FROM ProductVariant WHERE productId=? AND storeId=? ORDER BY name`,
          [productId, storeId],
        )
        return ok(rows)
      }
      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.productId || !b.name) return err('Missing required fields')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO ProductVariant (id,productId,storeId,name,sku,price,stock,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            b.productId,
            storeId,
            b.name,
            b.sku ?? null,
            b.price != null ? Number(b.price) : null,
            Number(b.stock ?? 0),
            1,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set(['name', 'sku', 'price', 'stock', 'active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(
          `UPDATE ProductVariant SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`,
          [...values, nowISO(), segs[1], storeId],
        )
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`DELETE FROM ProductVariant WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── Suppliers ────────────────────────────────────────────────────────────
    if (segs[0] === 'suppliers') {
      if (!segs[1] && method === 'GET') {
        const search = url.searchParams.get('search') ?? ''
        const rows = search
          ? await query(
              `SELECT * FROM Supplier WHERE storeId=? AND active=1 AND name LIKE ? ORDER BY name`,
              [storeId, `%${search}%`],
            )
          : await query(`SELECT * FROM Supplier WHERE storeId=? AND active=1 ORDER BY name`, [
              storeId,
            ])
        return ok(rows)
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.name || b.name.trim().length < 2) return err('Nama supplier minimal 2 karakter')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO Supplier (id,storeId,name,email,phone,address,taxId,notes,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,1,?,?)`,
          [
            id,
            storeId,
            b.name.trim(),
            b.email ?? null,
            b.phone ?? null,
            b.address ?? null,
            b.taxId ?? null,
            b.notes ?? null,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set(['name', 'email', 'phone', 'address', 'taxId', 'notes', 'active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Supplier SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`UPDATE Supplier SET active=0, updatedAt=? WHERE id=? AND storeId=?`, [
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ── Purchase Orders ───────────────────────────────────────────────────────
    if (segs[0] === 'purchase-orders') {
      if (!segs[1] && method === 'GET') {
        const status = url.searchParams.get('status') ?? ''
        const limit = parseInt(url.searchParams.get('limit') ?? '50')
        const offset = parseInt(url.searchParams.get('offset') ?? '0')
        const rows = await query(
          `SELECT po.*, s.name as supplierName
           FROM PurchaseOrder po
           JOIN Supplier s ON po.supplierId = s.id
           WHERE po.storeId=? ${status ? 'AND po.status=?' : ''}
           ORDER BY po.createdAt DESC LIMIT ? OFFSET ?`,
          status ? [storeId, status, limit, offset] : [storeId, limit, offset],
        )
        const total = await queryOne<any>(
          `SELECT COUNT(*) as count FROM PurchaseOrder WHERE storeId=? ${status ? 'AND status=?' : ''}`,
          status ? [storeId, status] : [storeId],
        )
        return ok({ orders: rows, total: total?.count ?? 0 })
      }
      if (segs[1] === 'lines' && method === 'GET') {
        // /api/purchase-orders/lines?orderId=xxx
        const orderId = url.searchParams.get('orderId')
        if (!orderId) return err('orderId required')
        const lines = await query(`SELECT * FROM PurchaseOrderLine WHERE orderId=?`, [orderId])
        return ok(lines)
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.supplierId) return err('Supplier harus dipilih')
        if (!b.lines || !Array.isArray(b.lines) || b.lines.length === 0)
          return err('Minimal 1 item')
        // Generate PO number
        const count = await queryOne<any>(
          `SELECT COUNT(*) as c FROM PurchaseOrder WHERE storeId=?`,
          [storeId],
        )
        const num = `PO-${String((count?.c ?? 0) + 1).padStart(4, '0')}`
        const t = nowISO()
        const id = newId()
        const subtotal = b.lines.reduce(
          (s: number, l: any) => s + Number(l.qty) * Number(l.unitCost),
          0,
        )
        const taxAmt = Math.round(subtotal * (b.taxRate ?? 0))
        const total = subtotal + taxAmt
        await exec(
          `INSERT INTO PurchaseOrder (id,storeId,supplierId,userId,number,status,expectedDate,subtotal,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.supplierId,
            user.id,
            num,
            b.expectedDate ?? null,
            subtotal,
            taxAmt,
            total,
            b.note ?? null,
            t,
            t,
          ],
        )
        for (const line of b.lines) {
          await exec(
            `INSERT INTO PurchaseOrderLine (id,orderId,productId,productName,qty,unitCost,receivedQty,subtotal,createdAt) VALUES (?,?,?,?,?,?,0,?,?)`,
            [
              newId(),
              id,
              line.productId,
              line.productName ?? '',
              Number(line.qty),
              Number(line.unitCost),
              Number(line.qty) * Number(line.unitCost),
              t,
            ],
          )
        }
        return ok({ id, number: num }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        // Status change
        if (b.status) {
          const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [
            segs[1],
            storeId,
          ])
          if (!po) return err('PO not found', 404)
          await exec(`UPDATE PurchaseOrder SET status=?, updatedAt=? WHERE id=? AND storeId=?`, [
            b.status,
            nowISO(),
            segs[1],
            storeId,
          ])
          return ok({ success: true })
        }
        // Goods receipt — receive items
        if (b.receive && Array.isArray(b.receive)) {
          const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [
            segs[1],
            storeId,
          ])
          if (!po) return err('PO not found', 404)
          if (!['SENT', 'CONFIRMED'].includes(po.status))
            return err('PO tidak bisa diterima dalam status ini')
          const t = nowISO()
          const receiptId = newId()
          const grNum = `GR-${Date.now().toString(36).toUpperCase()}`
          await exec(
            `INSERT INTO GoodsReceipt (id,storeId,orderId,userId,number,note,createdAt) VALUES (?,?,?,?,?,?,?)`,
            [receiptId, storeId, segs[1], user.id, grNum, b.note ?? null, t],
          )
          let allReceived = true
          for (const item of b.receive) {
            if (!item.lineId || !item.qty || item.qty <= 0) continue
            const line = await queryOne<any>(`SELECT * FROM PurchaseOrderLine WHERE id=?`, [
              item.lineId,
            ])
            if (!line) continue
            const newReceived = line.receivedQty + Number(item.qty)
            await exec(`UPDATE PurchaseOrderLine SET receivedQty=? WHERE id=?`, [
              newReceived,
              item.lineId,
            ])
            await exec(
              `INSERT INTO GoodsReceiptLine (id,receiptId,lineId,productId,qty) VALUES (?,?,?,?,?)`,
              [newId(), receiptId, item.lineId, line.productId, Number(item.qty)],
            )
            // Update product stock
            await exec(
              `UPDATE Product SET stock = stock + ?, updatedAt=? WHERE id=? AND storeId=?`,
              [Number(item.qty), t, line.productId, storeId],
            )
            await exec(
              `INSERT INTO StockLog (id,storeId,productId,userId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
              [
                newId(),
                storeId,
                line.productId,
                user.id,
                'PURCHASE',
                Number(item.qty),
                `GR: ${grNum}`,
                t,
              ],
            )
            if (newReceived < line.qty) allReceived = false
          }
          // Check all lines received
          const allLines = await query<any>(`SELECT * FROM PurchaseOrderLine WHERE orderId=?`, [
            segs[1],
          ])
          const fullyReceived = allLines.every((l: any) => l.receivedQty >= l.qty)
          if (fullyReceived) {
            await exec(`UPDATE PurchaseOrder SET status='RECEIVED', updatedAt=? WHERE id=?`, [
              t,
              segs[1],
            ])
          }
          return ok({ receiptId, number: grNum })
        }
        return err('No valid update')
      }
      // POST /api/purchase-orders/:id/receive  { lines: [{id, receivedQty}], note? }
      if (segs[1] && segs[2] === 'receive' && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.lines || !Array.isArray(b.lines) || b.lines.length === 0)
          return err('lines required')
        const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!po) return err('PO not found', 404)
        if (!['SENT', 'CONFIRMED'].includes(po.status))
          return err('PO tidak bisa diterima dalam status ini')
        const t = nowISO()
        const receiptId = newId()
        const grNum = `GR-${Date.now().toString(36).toUpperCase()}`
        await exec(
          `INSERT INTO GoodsReceipt (id,storeId,orderId,userId,number,note,createdAt) VALUES (?,?,?,?,?,?,?)`,
          [receiptId, storeId, segs[1], user.id, grNum, b.note ?? null, t],
        )
        for (const item of b.lines) {
          const qty = Number(item.receivedQty ?? item.qty ?? 0)
          if (!item.id || qty <= 0) continue
          const line = await queryOne<any>(
            `SELECT * FROM PurchaseOrderLine WHERE id=? AND orderId=?`,
            [item.id, segs[1]],
          )
          if (!line) continue
          const newReceived = line.receivedQty + qty
          await exec(`UPDATE PurchaseOrderLine SET receivedQty=? WHERE id=?`, [
            newReceived,
            item.id,
          ])
          await exec(
            `INSERT INTO GoodsReceiptLine (id,receiptId,lineId,productId,qty) VALUES (?,?,?,?,?)`,
            [newId(), receiptId, item.id, line.productId, qty],
          )
          // Update inventory stock
          await exec(`UPDATE Product SET stock = stock + ?, updatedAt=? WHERE id=? AND storeId=?`, [
            qty,
            t,
            line.productId,
            storeId,
          ])
          await exec(
            `INSERT INTO StockLog (id,storeId,productId,userId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
            [newId(), storeId, line.productId, user.id, 'PURCHASE', qty, `GR: ${grNum}`, t],
          )
        }
        // Auto-advance status to RECEIVED if all lines fully received
        const allLines = await query<any>(`SELECT * FROM PurchaseOrderLine WHERE orderId=?`, [
          segs[1],
        ])
        const fullyReceived = allLines.every((l: any) => l.receivedQty >= l.qty)
        const newStatus = fullyReceived ? 'RECEIVED' : po.status
        if (fullyReceived) {
          await exec(`UPDATE PurchaseOrder SET status='RECEIVED', updatedAt=? WHERE id=?`, [
            t,
            segs[1],
          ])
        }
        return ok({ receiptId, number: grNum, status: newStatus }, 201)
      }

      // POST /api/purchase-orders/:id/duplicate  — copy to new DRAFT
      if (segs[1] && segs[2] === 'duplicate' && method === 'POST') {
        const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!po) return err('PO not found', 404)
        const origLines = await query<any>(`SELECT * FROM PurchaseOrderLine WHERE orderId=?`, [
          segs[1],
        ])
        const count = await queryOne<any>(
          `SELECT COUNT(*) as c FROM PurchaseOrder WHERE storeId=?`,
          [storeId],
        )
        const num = `PO-${String((count?.c ?? 0) + 1).padStart(4, '0')}`
        const t = nowISO()
        const newPoId = newId()
        await exec(
          `INSERT INTO PurchaseOrder (id,storeId,supplierId,userId,number,status,expectedDate,subtotal,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?)`,
          [
            newPoId,
            storeId,
            po.supplierId,
            user.id,
            num,
            po.expectedDate ?? null,
            po.subtotal,
            po.taxAmt,
            po.total,
            po.note ?? null,
            t,
            t,
          ],
        )
        for (const line of origLines) {
          await exec(
            `INSERT INTO PurchaseOrderLine (id,orderId,productId,productName,qty,unitCost,receivedQty,subtotal,createdAt) VALUES (?,?,?,?,?,?,0,?,?)`,
            [
              newId(),
              newPoId,
              line.productId,
              line.productName,
              line.qty,
              line.unitCost,
              line.subtotal,
              t,
            ],
          )
        }
        return ok({ id: newPoId, number: num }, 201)
      }

      if (segs[1] && method === 'DELETE') {
        const po = await queryOne<any>(
          `SELECT status FROM PurchaseOrder WHERE id=? AND storeId=?`,
          [segs[1], storeId],
        )
        if (!po) return err('PO not found', 404)
        if (!['DRAFT', 'CANCELLED'].includes(po.status))
          return err('Hanya PO DRAFT yang bisa dihapus')
        await exec(`DELETE FROM PurchaseOrderLine WHERE orderId=?`, [segs[1]])
        await exec(`DELETE FROM PurchaseOrder WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── Chart of Accounts ────────────────────────────────────────────────────
    if (segs[0] === 'accounts') {
      if (!segs[1] && method === 'GET') {
        const type = url.searchParams.get('type') ?? ''
        const rows = type
          ? await query(
              `SELECT * FROM ChartOfAccount WHERE storeId=? AND active=1 AND type=? ORDER BY code`,
              [storeId, type],
            )
          : await query(`SELECT * FROM ChartOfAccount WHERE storeId=? AND active=1 ORDER BY code`, [
              storeId,
            ])
        // Also include system accounts from demo store for new tenants without seeded accounts
        if ((rows as any[]).length === 0) {
          const demo = await query(
            `SELECT * FROM ChartOfAccount WHERE storeId='store_demo' AND active=1 ORDER BY code`,
            [],
          )
          return ok(demo)
        }
        return ok(rows)
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.code || !/^\d{3,6}$/.test(b.code)) return err('Kode akun harus 3-6 digit angka')
        if (!b.name || b.name.trim().length < 2) return err('Nama akun minimal 2 karakter')
        if (!b.type) return err('Tipe akun harus diisi')
        const normalBalance = ['ASSET', 'EXPENSE'].includes(b.type) ? 'DEBIT' : 'CREDIT'
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO ChartOfAccount (id,storeId,code,name,type,normalBalance,parentId,balance,active,isSystem,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,0,1,0,?,?)`,
          [id, storeId, b.code, b.name.trim(), b.type, normalBalance, b.parentId ?? null, t, t],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        // Validate code if provided — must be exactly 4 numeric digits
        if (b.code !== undefined) {
          if (!/^\d{4}$/.test(b.code)) return err('Kode akun harus 4 digit angka')
        }
        if (b.name !== undefined && b.name.trim().length < 2)
          return err('Nama akun minimal 2 karakter')
        const allowed = new Set(['name', 'code', 'type', 'parentId', 'active'])
        const cols = filterCols(b, allowed)
        if (b.name) cols.name = (b.name as string).trim()
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(
          `UPDATE ChartOfAccount SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`,
          [...values, nowISO(), segs[1], storeId],
        )
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        const account = await queryOne<any>(
          `SELECT * FROM ChartOfAccount WHERE id=? AND storeId=?`,
          [segs[1], storeId],
        )
        if (!account) return err('Akun tidak ditemukan', 404)
        if (account.isSystem) return err('Akun sistem tidak dapat dihapus', 403)
        if (account.balance !== 0)
          return err('Tidak dapat menghapus akun dengan saldo tidak nol', 409)
        // Soft-delete: set active=0 so journal history is preserved
        await exec(`UPDATE ChartOfAccount SET active=0, updatedAt=? WHERE id=? AND storeId=?`, [
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ── Journal Entries ───────────────────────────────────────────────────────
    if (segs[0] === 'journal') {
      if (!segs[1] && method === 'GET') {
        const from = url.searchParams.get('from') ?? ''
        const to = url.searchParams.get('to') ?? ''
        const status = url.searchParams.get('status') ?? ''
        const limit = parseInt(url.searchParams.get('limit') ?? '50')
        const offset = parseInt(url.searchParams.get('offset') ?? '0')
        let q = `SELECT * FROM JournalEntry WHERE storeId=?`
        const params: any[] = [storeId]
        if (from) {
          q += ' AND date >= ?'
          params.push(from)
        }
        if (to) {
          q += ' AND date <= ?'
          params.push(to)
        }
        if (status) {
          q += ' AND status=?'
          params.push(status)
        }
        q += ' ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?'
        params.push(limit, offset)
        const entries = await query(q, params)
        return ok(entries)
      }
      if (segs[1] === 'lines' && method === 'GET') {
        const entryId = url.searchParams.get('entryId')
        if (!entryId) return err('entryId required')
        const lines = await query(
          `SELECT jl.*, a.code, a.name as accountName FROM JournalLine jl JOIN ChartOfAccount a ON jl.accountId=a.id WHERE jl.entryId=? ORDER BY jl.debit DESC`,
          [entryId],
        )
        return ok(lines)
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.date) return err('Tanggal harus diisi')
        if (!b.description || b.description.trim().length < 2)
          return err('Deskripsi minimal 2 karakter')
        if (!b.lines || b.lines.length < 2) return err('Minimal 2 baris jurnal')
        const totalDebit = b.lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0)
        const totalCredit = b.lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01)
          return err('Jurnal tidak balance (debit ≠ kredit)')
        for (const line of b.lines) {
          if (Number(line.debit ?? 0) < 0 || Number(line.credit ?? 0) < 0)
            return err('Nilai tidak boleh negatif')
          if (Number(line.debit ?? 0) === 0 && Number(line.credit ?? 0) === 0)
            return err('Baris tidak boleh nol semua')
        }
        const count = await queryOne<any>(
          `SELECT COUNT(*) as c FROM JournalEntry WHERE storeId=?`,
          [storeId],
        )
        const num = `JE-${String((count?.c ?? 0) + 1).padStart(5, '0')}`
        const t = nowISO()
        const id = newId()
        await exec(
          `INSERT INTO JournalEntry (id,storeId,userId,number,date,description,reference,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            user.id,
            num,
            b.date,
            b.description.trim(),
            b.reference ?? null,
            b.status ?? 'DRAFT',
            t,
            t,
          ],
        )
        for (const line of b.lines) {
          await exec(
            `INSERT INTO JournalLine (id,entryId,accountId,debit,credit,description,createdAt) VALUES (?,?,?,?,?,?,?)`,
            [
              newId(),
              id,
              line.accountId,
              Number(line.debit ?? 0),
              Number(line.credit ?? 0),
              line.description ?? null,
              t,
            ],
          )
        }
        return ok({ id, number: num }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const entry = await queryOne<any>(`SELECT * FROM JournalEntry WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!entry) return err('Entry not found', 404)
        if (entry.status === 'POSTED' && b.status !== 'VOIDED')
          return err('Entry sudah diposting, tidak bisa diedit')
        await exec(`UPDATE JournalEntry SET status=?, updatedAt=? WHERE id=? AND storeId=?`, [
          b.status,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ── accounting/journal alias ──────────────────────────────────────────────
    // POST /api/accounting/journal  →  create a journal entry
    // GET  /api/accounting/journal  →  list journal entries
    if (segs[0] === 'accounting' && segs[1] === 'journal') {
      if (method === 'GET') {
        const from = sp.get('from') ?? ''
        const to = sp.get('to') ?? ''
        let q = `SELECT * FROM JournalEntry WHERE storeId=?`
        const params: any[] = [storeId]
        if (from) {
          q += ' AND date >= ?'
          params.push(from)
        }
        if (to) {
          q += ' AND date <= ?'
          params.push(to)
        }
        q += ' ORDER BY date DESC, createdAt DESC LIMIT 100'
        const entries = await query(q, params)
        return ok(entries)
      }
      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.date) return err('Tanggal harus diisi')
        if (!b.description || b.description.trim().length < 2)
          return err('Deskripsi minimal 2 karakter')
        if (!b.lines || b.lines.length < 2) return err('Minimal 2 baris jurnal')
        const totalDebit = b.lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0)
        const totalCredit = b.lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01)
          return err('Jurnal tidak balance (debit ≠ kredit)')
        const count = await queryOne<any>(
          `SELECT COUNT(*) as c FROM JournalEntry WHERE storeId=?`,
          [storeId],
        )
        const num = `JE-${String((count?.c ?? 0) + 1).padStart(5, '0')}`
        const t = nowISO()
        const id = newId()
        await exec(
          `INSERT INTO JournalEntry (id,storeId,userId,number,date,description,reference,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            user.id,
            num,
            b.date,
            b.description.trim(),
            b.reference ?? null,
            'DRAFT',
            t,
            t,
          ],
        )
        for (const line of b.lines) {
          await exec(
            `INSERT INTO JournalLine (id,entryId,accountId,debit,credit,description,createdAt) VALUES (?,?,?,?,?,?,?)`,
            [
              newId(),
              id,
              line.accountId,
              Number(line.debit ?? 0),
              Number(line.credit ?? 0),
              line.description ?? null,
              t,
            ],
          )
        }
        return ok({ id, number: num }, 201)
      }
    }

    // ── Financial Reports ─────────────────────────────────────────────────────
    if (segs[0] === 'financial-reports') {
      const from =
        url.searchParams.get('from') ??
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
      const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10)

      if (segs[1] === 'pnl') {
        const accounts = await query<any>(
          `SELECT * FROM ChartOfAccount WHERE storeId=? OR storeId='store_demo' AND active=1`,
          [storeId],
        )
        const entries = await query<any>(
          `SELECT je.id, je.date FROM JournalEntry je WHERE (je.storeId=? OR je.storeId='store_demo') AND je.status='POSTED' AND je.date BETWEEN ? AND ?`,
          [storeId, from, to],
        )
        const allLines = await Promise.all(
          entries.map((e: any) => query<any>(`SELECT * FROM JournalLine WHERE entryId=?`, [e.id])),
        )
        const flatLines = allLines.flat()

        let revenue = 0
        let expenses = 0
        for (const acc of accounts) {
          const lines = flatLines.filter((l: any) => l.accountId === acc.id)
          if (acc.type === 'REVENUE') {
            revenue += lines.reduce((s: number, l: any) => s + l.credit - l.debit, 0)
          }
          if (acc.type === 'EXPENSE') {
            expenses += lines.reduce((s: number, l: any) => s + l.debit - l.credit, 0)
          }
        }

        // Also factor in Expense records (non-accounting expenses)
        const expenseRecords = await queryOne<any>(
          `SELECT COALESCE(SUM(amount),0) as total FROM Expense WHERE storeId=? AND date BETWEEN ? AND ?`,
          [storeId, from, to],
        )
        expenses += expenseRecords?.total ?? 0

        // Factor in POS revenue
        const posRevenue = await queryOne<any>(
          `SELECT COALESCE(SUM(total),0) as total FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`,
          [storeId, `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`],
        )
        revenue += posRevenue?.total ?? 0

        return ok({ from, to, revenue, expenses, netProfit: revenue - expenses })
      }

      if (segs[1] === 'balance-sheet') {
        const storeAccs = await query<any>(
          `SELECT * FROM ChartOfAccount WHERE (storeId=? OR storeId='store_demo') AND active=1`,
          [storeId],
        )
        const lines = await query<any>(
          `SELECT jl.* FROM JournalLine jl
           JOIN JournalEntry je ON jl.entryId=je.id
           WHERE (je.storeId=? OR je.storeId='store_demo') AND je.status='POSTED' AND je.date <= ?`,
          [storeId, to],
        )

        const result: Record<string, { code: string; name: string; balance: number }[]> = {
          ASSET: [],
          LIABILITY: [],
          EQUITY: [],
        }
        for (const acc of storeAccs.filter((a: any) =>
          ['ASSET', 'LIABILITY', 'EQUITY'].includes(a.type),
        )) {
          const accLines = lines.filter((l: any) => l.accountId === acc.id)
          const nb = acc.normalBalance
          const balance =
            acc.balance +
            accLines.reduce(
              (s: number, l: any) =>
                nb === 'DEBIT' ? s + l.debit - l.credit : s + l.credit - l.debit,
              0,
            )
          if (balance !== 0) result[acc.type].push({ code: acc.code, name: acc.name, balance })
        }
        const totalAssets = result.ASSET.reduce((s, a) => s + a.balance, 0)
        const totalLiabilities = result.LIABILITY.reduce((s, a) => s + a.balance, 0)
        const totalEquity = result.EQUITY.reduce((s, a) => s + a.balance, 0)
        return ok({ as_of: to, accounts: result, totalAssets, totalLiabilities, totalEquity })
      }
    }

    // ── Employees ─────────────────────────────────────────────────────────────
    if (segs[0] === 'employees') {
      if (!segs[1] && method === 'GET') {
        const search = url.searchParams.get('search') ?? ''
        const dept = url.searchParams.get('department') ?? ''
        let q = `SELECT * FROM Employee WHERE storeId=? AND active=1`
        const params: any[] = [storeId]
        if (search) {
          q += ` AND (name LIKE ? OR position LIKE ? OR nik LIKE ?)`
          params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }
        if (dept) {
          q += ` AND department=?`
          params.push(dept)
        }
        q += ` ORDER BY name`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.name || b.name.trim().length < 2) return err('Nama karyawan minimal 2 karakter')
        if (!b.position || b.position.trim().length < 2) return err('Posisi harus diisi')
        if (b.baseSalary == null || Number(b.baseSalary) < 0)
          return err('Gaji pokok tidak boleh negatif')
        if (!b.joinDate) return err('Tanggal bergabung harus diisi')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO Employee (id,storeId,userId,name,nik,position,department,baseSalary,employmentStatus,employmentType,joinDate,phone,email,address,bankName,bankAccount,bankAccountName,notes,active,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
          [
            id,
            storeId,
            b.userId ?? null,
            b.name.trim(),
            b.nik ?? null,
            b.position.trim(),
            b.department ?? null,
            Number(b.baseSalary),
            b.employmentStatus ?? 'ACTIVE',
            b.employmentType ?? 'FULL_TIME',
            b.joinDate,
            b.phone ?? null,
            b.email ?? null,
            b.address ?? null,
            b.bankName ?? null,
            b.bankAccount ?? null,
            b.bankAccountName ?? null,
            b.notes ?? null,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'GET') {
        const emp = await queryOne(`SELECT * FROM Employee WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!emp) return err('Employee not found', 404)
        return ok(emp)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set([
          'name',
          'nik',
          'position',
          'department',
          'baseSalary',
          'employmentStatus',
          'employmentType',
          'joinDate',
          'endDate',
          'phone',
          'email',
          'address',
          'bankName',
          'bankAccount',
          'bankAccountName',
          'notes',
          'active',
        ])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Employee SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(
          `UPDATE Employee SET active=0, employmentStatus='TERMINATED', updatedAt=? WHERE id=? AND storeId=?`,
          [nowISO(), segs[1], storeId],
        )
        return ok({ success: true })
      }
    }

    // ── Attendance ─────────────────────────────────────────────────────────────
    if (segs[0] === 'attendance') {
      if (!segs[1] && method === 'GET') {
        const employeeId = url.searchParams.get('employeeId') ?? ''
        const from = url.searchParams.get('from') ?? ''
        const to = url.searchParams.get('to') ?? ''
        let q = `SELECT a.*, e.name as employeeName, e.position FROM Attendance a JOIN Employee e ON a.employeeId=e.id WHERE a.storeId=?`
        const params: any[] = [storeId]
        if (employeeId) {
          q += ` AND a.employeeId=?`
          params.push(employeeId)
        }
        if (from) {
          q += ` AND a.date >= ?`
          params.push(from)
        }
        if (to) {
          q += ` AND a.date <= ?`
          params.push(to)
        }
        q += ` ORDER BY a.date DESC, e.name`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.employeeId || !b.date) return err('employeeId and date required')
        // Calculate late minutes
        let lateMinutes = 0
        if (b.checkIn && b.scheduleStart) {
          const [ch, cm] = b.checkIn.split(':').map(Number)
          const [sh, sm] = b.scheduleStart.split(':').map(Number)
          lateMinutes = Math.max(0, ch * 60 + cm - (sh * 60 + sm))
        }
        const status = !b.checkIn ? 'ABSENT' : lateMinutes > 15 ? 'LATE' : 'PRESENT'
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT OR REPLACE INTO Attendance (id,storeId,employeeId,date,checkIn,checkOut,status,lateMinutes,overtimeMinutes,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.employeeId,
            b.date,
            b.checkIn ?? null,
            b.checkOut ?? null,
            b.status ?? status,
            lateMinutes,
            b.overtimeMinutes ?? 0,
            b.note ?? null,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set([
          'checkIn',
          'checkOut',
          'status',
          'lateMinutes',
          'overtimeMinutes',
          'note',
        ])
        const cols = filterCols(b, allowed)
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Attendance SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ── Payroll ────────────────────────────────────────────────────────────────
    if (segs[0] === 'payroll') {
      if (!segs[1] && method === 'GET') {
        const runs = await query(
          `SELECT * FROM PayrollRun WHERE storeId=? ORDER BY period DESC LIMIT 24`,
          [storeId],
        )
        return ok(runs)
      }
      if (segs[1] === 'payslips' && method === 'GET') {
        const runId = url.searchParams.get('runId')
        const employeeId = url.searchParams.get('employeeId')
        let q = `SELECT p.*, e.name as employeeName, e.position FROM Payslip p JOIN Employee e ON p.employeeId=e.id WHERE p.storeId=?`
        const params: any[] = [storeId]
        if (runId) {
          q += ` AND p.runId=?`
          params.push(runId)
        }
        if (employeeId) {
          q += ` AND p.employeeId=?`
          params.push(employeeId)
        }
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        // Generate payroll run for a period
        const b = (await req.json()) as any
        if (!b.period) return err('Period harus diisi (format: YYYY-MM)')
        const employees = await query<any>(
          `SELECT * FROM Employee WHERE storeId=? AND active=1 AND employmentStatus='ACTIVE'`,
          [storeId],
        )
        if ((employees as any[]).length === 0) return err('Tidak ada karyawan aktif')
        const t = nowISO()
        const runId = newId()
        let totalGross = 0
        let totalDed = 0
        let totalNet = 0

        // Calculate working days for the period
        const [yr, mo] = b.period.split('-').map(Number)
        const firstDay = `${b.period}-01`
        const lastDay = new Date(yr, mo, 0).toISOString().slice(0, 10)

        await exec(
          `INSERT INTO PayrollRun (id,storeId,userId,period,status,totalGross,totalDeductions,totalNet,note,createdAt,updatedAt) VALUES (?,?,?,?,'DRAFT',0,0,0,?,?,?)`,
          [runId, storeId, user.id, b.period, b.note ?? null, t, t],
        )

        for (const emp of employees as any[]) {
          const allowances = JSON.parse(emp.allowances ?? '[]') as any[]
          const gross = emp.baseSalary + allowances.reduce((s: number, a: any) => s + a.amount, 0)

          // Auto calculate BPJS + PPh21
          const bpjsHealth = Math.round(Math.min(gross, 12_000_000) * 0.01)
          const bpjsEmployment = Math.round(gross * 0.02)
          const annualGross = gross * 12
          const pkp = Math.max(0, annualGross - 54_000_000)
          let pph21Monthly = 0
          if (pkp > 0) {
            let annualTax = pkp <= 60_000_000 ? pkp * 0.05 : 3_000_000 + (pkp - 60_000_000) * 0.15
            pph21Monthly = Math.round(annualTax / 12)
          }
          const deductions = [
            { name: 'BPJS Kesehatan', amount: bpjsHealth },
            { name: 'BPJS Ketenagakerjaan (JHT)', amount: bpjsEmployment },
            ...(pph21Monthly > 0 ? [{ name: 'PPh 21', amount: pph21Monthly }] : []),
            ...JSON.parse(emp.deductions ?? '[]'),
          ]
          const totalDeduct = deductions.reduce((s: number, d: any) => s + d.amount, 0)
          const net = Math.max(0, gross - totalDeduct)

          totalGross += gross
          totalDed += totalDeduct
          totalNet += net

          await exec(
            `INSERT INTO Payslip (id,runId,employeeId,storeId,period,baseSalary,allowances,deductions,grossSalary,totalDeductions,netSalary,workedDays,workingDays,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              newId(),
              runId,
              emp.id,
              storeId,
              b.period,
              emp.baseSalary,
              JSON.stringify(allowances),
              JSON.stringify(deductions),
              gross,
              totalDeduct,
              net,
              0,
              0,
              'DRAFT',
              t,
              t,
            ],
          )
        }
        await exec(
          `UPDATE PayrollRun SET totalGross=?, totalDeductions=?, totalNet=?, updatedAt=? WHERE id=?`,
          [totalGross, totalDed, totalNet, t, runId],
        )
        return ok({ runId, totalGross, totalNet, employeeCount: (employees as any[]).length }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        await exec(
          `UPDATE PayrollRun SET status=?, paidAt=?, updatedAt=? WHERE id=? AND storeId=?`,
          [b.status, b.status === 'PAID' ? nowISO() : null, nowISO(), segs[1], storeId],
        )
        if (b.status === 'PAID') {
          await exec(`UPDATE Payslip SET status='PAID', paidAt=?, updatedAt=? WHERE runId=?`, [
            nowISO(),
            nowISO(),
            segs[1],
          ])
        }
        return ok({ success: true })
      }
    }

    // ── CRM / Leads ───────────────────────────────────────────────────────────
    if (segs[0] === 'leads') {
      if (!segs[1] && method === 'GET') {
        const status = url.searchParams.get('status') ?? ''
        const search = url.searchParams.get('search') ?? ''
        let q = `SELECT * FROM Lead WHERE storeId=?`
        const params: any[] = [storeId]
        if (status) {
          q += ` AND status=?`
          params.push(status)
        }
        if (search) {
          q += ` AND (name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)`
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
        }
        q += ` ORDER BY priority DESC, createdAt DESC`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.name || b.name.trim().length < 2) return err('Nama lead minimal 2 karakter')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO Lead (id,storeId,name,company,email,phone,source,status,priority,value,probability,expectedCloseDate,assignedTo,notes,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.name.trim(),
            b.company ?? null,
            b.email ?? null,
            b.phone ?? null,
            b.source ?? null,
            b.status ?? 'NEW',
            b.priority ?? 'MEDIUM',
            Number(b.value ?? 0),
            Number(b.probability ?? 10),
            b.expectedCloseDate ?? null,
            b.assignedTo ?? null,
            b.notes ?? null,
            b.tags ?? null,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'GET') {
        const lead = await queryOne(`SELECT * FROM Lead WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!lead) return err('Lead not found', 404)
        return ok(lead)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set([
          'name',
          'company',
          'email',
          'phone',
          'source',
          'status',
          'priority',
          'value',
          'probability',
          'expectedCloseDate',
          'assignedTo',
          'customerId',
          'notes',
          'tags',
        ])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Lead SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`DELETE FROM Lead WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── CRM Activities ────────────────────────────────────────────────────────
    if (segs[0] === 'lead-activities') {
      if (!segs[1] && method === 'GET') {
        const leadId = url.searchParams.get('leadId') ?? ''
        let q = `SELECT * FROM LeadActivity WHERE storeId=?`
        const params: any[] = [storeId]
        if (leadId) {
          q += ` AND leadId=?`
          params.push(leadId)
        }
        q += ` ORDER BY createdAt DESC`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.leadId || !b.title) return err('leadId and title required')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO LeadActivity (id,storeId,leadId,userId,type,title,note,dueDate,completedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.leadId,
            user.id,
            b.type ?? 'NOTE',
            b.title.trim(),
            b.note ?? null,
            b.dueDate ?? null,
            b.completedAt ?? null,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set(['title', 'note', 'dueDate', 'completedAt'])
        const cols = filterCols(b, allowed)
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE LeadActivity SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }
    }

    // ─── LOYALTY TIERS ────────────────────────────────────────────────────────
    if (segs[0] === 'loyalty-tiers') {
      if (!segs[1]) {
        if (method === 'GET') {
          return ok(
            await query(`SELECT * FROM LoyaltyTier WHERE storeId=? ORDER BY minPoints ASC`, [
              storeId,
            ]),
          )
        }
        if (method === 'POST') {
          const b = (await req.json()) as any
          if (!b.name || b.name.trim().length < 1) return err('name is required')
          const id = newId()
          const t = nowISO()
          await exec(
            `INSERT INTO LoyaltyTier (id,storeId,name,minPoints,discount,color,icon,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
            [
              id,
              storeId,
              b.name.trim(),
              Number(b.minPoints ?? 0),
              Number(b.discount ?? 0),
              b.color ?? '#f59e0b',
              b.icon ?? '⭐',
              t,
            ],
          )
          return ok({ id }, 201)
        }
      }
      if (segs[1]) {
        const tid = segs[1]
        if (method === 'PATCH') {
          const b = (await req.json()) as any
          const allowed = new Set(['name', 'minPoints', 'discount', 'color', 'icon'])
          const cols = filterCols(b, allowed)
          if (Object.keys(cols).length === 0) return err('No valid fields')
          const { setClauses, values } = buildUpdate(cols)
          await exec(`UPDATE LoyaltyTier SET ${setClauses} WHERE id=? AND storeId=?`, [
            ...values,
            tid,
            storeId,
          ])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec(`DELETE FROM LoyaltyTier WHERE id=? AND storeId=?`, [tid, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── LOYALTY MEMBERS ──────────────────────────────────────────────────────
    if (segs[0] === 'loyalty-members' && method === 'GET') {
      const search = sp.get('q') ?? ''
      const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50')))
      const offset = Math.max(0, parseInt(sp.get('offset') ?? '0'))
      let sql = `SELECT id, name, phone, email, points, createdAt FROM Customer WHERE storeId=?`
      const p: any[] = [storeId]
      if (search) {
        sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`
        p.push(`%${search}%`, `%${search}%`, `%${search}%`)
      }
      sql += ` ORDER BY points DESC LIMIT ? OFFSET ?`
      p.push(limit, offset)
      return ok(await query(sql, p))
    }

    // ─── LOYALTY REDEMPTIONS ──────────────────────────────────────────────────
    if (segs[0] === 'loyalty-redemptions' && method === 'GET') {
      const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50')))
      const offset = Math.max(0, parseInt(sp.get('offset') ?? '0'))
      return ok(
        await query(
          `SELECT r.*, c.name as customerName FROM LoyaltyRedemption r
         LEFT JOIN Customer c ON r.customerId = c.id
         WHERE r.storeId=? ORDER BY r.createdAt DESC LIMIT ? OFFSET ?`,
          [storeId, limit, offset],
        ),
      )
    }

    // ─── LOYALTY REDEEM ───────────────────────────────────────────────────────
    if (segs[0] === 'loyalty-redeem' && method === 'POST') {
      const b = (await req.json()) as any
      if (!b.customerId) return err('customerId is required')
      if (!b.pointsRedeemed || Number(b.pointsRedeemed) <= 0)
        return err('pointsRedeemed must be > 0')
      const customer = await queryOne<any>(
        `SELECT id, points FROM Customer WHERE id=? AND storeId=?`,
        [b.customerId, storeId],
      )
      if (!customer) return err('Customer not found', 404)
      const pts = Number(b.pointsRedeemed)
      if (customer.points < pts) return err('Insufficient points', 400)
      const discountGiven = Number(b.discountGiven ?? 0)
      const id = newId()
      const t = nowISO()
      await exec(
        `INSERT INTO LoyaltyRedemption (id,storeId,customerId,orderId,pointsRedeemed,discountGiven,createdAt) VALUES (?,?,?,?,?,?,?)`,
        [id, storeId, b.customerId, b.orderId ?? null, pts, discountGiven, t],
      )
      await exec(
        `UPDATE Customer SET points = MAX(0, points - ?), updatedAt=? WHERE id=? AND storeId=?`,
        [pts, t, b.customerId, storeId],
      )
      return ok({ id, pointsRedeemed: pts, discountGiven }, 201)
    }

    // ── Manufacturing: Bill of Materials ─────────────────────────────────────
    if (segs[0] === 'bom') {
      // GET /api/bom/:id/components
      if (segs[1] && segs[2] === 'components' && method === 'GET') {
        const components = await query(`SELECT * FROM BOMComponent WHERE bomId=?`, [segs[1]])
        return ok(components)
      }
      // GET /api/bom
      if (!segs[1] && method === 'GET') {
        const rows = await query(
          `SELECT * FROM BillOfMaterials WHERE storeId=? ORDER BY createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }
      // POST /api/bom
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.name || b.name.trim().length < 2) return err('Nama minimal 2 karakter')
        if (!b.outputQty || Number(b.outputQty) <= 0) return err('outputQty harus > 0')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO BillOfMaterials (id,storeId,name,description,outputProductId,outputQty,unit,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,1,?,?)`,
          [
            id,
            storeId,
            b.name.trim(),
            b.description ?? null,
            b.outputProductId ?? null,
            Number(b.outputQty),
            b.unit ?? 'pcs',
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      // GET /api/bom/:id
      if (segs[1] && !segs[2] && method === 'GET') {
        const bom = await queryOne(`SELECT * FROM BillOfMaterials WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!bom) return err('BOM not found', 404)
        return ok(bom)
      }
    }

    // ── Manufacturing: Work Orders ────────────────────────────────────────────
    if (segs[0] === 'work-orders') {
      // GET /api/work-orders
      if (!segs[1] && method === 'GET') {
        const rows = await query(
          `SELECT wo.*, b.name as bomName FROM WorkOrder wo
         LEFT JOIN BillOfMaterials b ON wo.bomId = b.id
         WHERE wo.storeId=? ORDER BY wo.createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }
      // POST /api/work-orders
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.bomId) return err('bomId required')
        if (!b.plannedQty || Number(b.plannedQty) <= 0) return err('plannedQty harus > 0')
        const bom = await queryOne(`SELECT * FROM BillOfMaterials WHERE id=? AND storeId=?`, [
          b.bomId,
          storeId,
        ])
        if (!bom) return err('BOM not found', 404)
        const id = newId()
        const t = nowISO()
        // Generate sequential WO number
        const countRow = (await queryOne(`SELECT COUNT(*) as cnt FROM WorkOrder WHERE storeId=?`, [
          storeId,
        ])) as any
        const seq = (countRow?.cnt ?? 0) + 1
        const number = `WO-${storeId.slice(0, 4).toUpperCase()}-${String(seq).padStart(4, '0')}`
        await exec(
          `INSERT INTO WorkOrder (id,storeId,number,bomId,status,plannedQty,producedQty,plannedStart,actualStart,completedAt,notes,createdAt,updatedAt) VALUES (?,?,?,?,?,?,0,?,null,null,?,?,?)`,
          [
            id,
            storeId,
            number,
            b.bomId,
            'DRAFT',
            Number(b.plannedQty),
            b.plannedStart ?? null,
            b.notes ?? null,
            t,
            t,
          ],
        )
        // Pre-populate WorkOrderMaterial from BOM components
        const components = (await query(`SELECT * FROM BOMComponent WHERE bomId=?`, [
          b.bomId,
        ])) as any[]
        for (const comp of components) {
          await exec(
            `INSERT INTO WorkOrderMaterial (id,workOrderId,productId,requiredQty,consumedQty) VALUES (?,?,?,?,0)`,
            [newId(), id, comp.productId, comp.qty * Number(b.plannedQty)],
          )
        }
        return ok({ id, number }, 201)
      }
      // PATCH /api/work-orders/:id
      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        const wo = (await queryOne(`SELECT * FROM WorkOrder WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])) as any
        if (!wo) return err('Work order not found', 404)
        const validTransitions: Record<string, string[]> = {
          DRAFT: ['IN_PROGRESS', 'CANCELLED'],
          IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
          COMPLETED: [],
          CANCELLED: [],
        }
        if (b.status && !validTransitions[wo.status]?.includes(b.status)) {
          return err(`Tidak bisa transisi dari ${wo.status} ke ${b.status}`)
        }
        const t = nowISO()
        const actualStart = b.status === 'IN_PROGRESS' ? t : (wo.actualStart ?? null)
        const completedAt = b.status === 'COMPLETED' ? t : (wo.completedAt ?? null)
        const producedQty = b.producedQty !== undefined ? Number(b.producedQty) : wo.producedQty
        await exec(
          `UPDATE WorkOrder SET status=?, producedQty=?, actualStart=?, completedAt=?, notes=?, updatedAt=? WHERE id=? AND storeId=?`,
          [
            b.status ?? wo.status,
            producedQty,
            actualStart,
            completedAt,
            b.notes ?? wo.notes,
            t,
            segs[1],
            storeId,
          ],
        )
        return ok({ success: true })
      }
    }

    // ─── DASHBOARD QUICK STATS ────────────────────────────────────────────────
    if (segs[0] === 'dashboard' && segs[1] === 'quick-stats' && method === 'GET') {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const tomorrowStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).toISOString()
      const yesterdayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
      ).toISOString()

      const [
        todayRev,
        yesterdayRev,
        todayCount,
        yesterdayCount,
        lowStock,
        topProduct,
        activeShift,
      ] = await Promise.all([
        queryOne<any>(
          `SELECT COALESCE(SUM(total), 0) as revenue FROM "Order" WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
          [storeId, todayStart, tomorrowStart],
        ),
        queryOne<any>(
          `SELECT COALESCE(SUM(total), 0) as revenue FROM "Order" WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
          [storeId, yesterdayStart, todayStart],
        ),
        queryOne<any>(
          `SELECT COUNT(*) as count FROM "Order" WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
          [storeId, todayStart, tomorrowStart],
        ),
        queryOne<any>(
          `SELECT COUNT(*) as count FROM "Order" WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
          [storeId, yesterdayStart, todayStart],
        ),
        queryOne<any>(
          `SELECT COUNT(*) as count FROM Product WHERE storeId=? AND trackStock=1 AND active=1 AND stock <= lowStock`,
          [storeId],
        ),
        queryOne<any>(
          `SELECT p.id, p.name, COALESCE(SUM(oi.qty), 0) as totalQty, COALESCE(SUM(oi.total), 0) as totalRevenue
         FROM OrderItem oi
         JOIN "Order" o ON oi.orderId = o.id
         JOIN Product p ON oi.productId = p.id
         WHERE o.storeId=? AND o.status='COMPLETED' AND o.createdAt >= ? AND o.createdAt < ?
         GROUP BY p.id, p.name ORDER BY totalQty DESC LIMIT 1`,
          [storeId, todayStart, tomorrowStart],
        ),
        queryOne<any>(
          `SELECT * FROM Shift WHERE storeId=? AND closedAt IS NULL ORDER BY openedAt DESC LIMIT 1`,
          [storeId],
        ),
      ])

      return ok({
        todayRevenue: todayRev?.revenue ?? 0,
        yesterdayRevenue: yesterdayRev?.revenue ?? 0,
        todayOrderCount: todayCount?.count ?? 0,
        yesterdayOrderCount: yesterdayCount?.count ?? 0,
        lowStockCount: lowStock?.count ?? 0,
        topProductToday: topProduct ?? null,
        activeShift: activeShift ?? null,
      })
    }

    // ─── BUNDLES ──────────────────────────────────────────────────────────────
    if (segs[0] === 'bundles') {
      if (segs.length === 1) {
        if (method === 'GET') {
          const rows = await query(
            `SELECT b.*, GROUP_CONCAT(bi.id||':'||bi.productId||':'||bi.qty) as itemsRaw
           FROM ProductBundle b
           LEFT JOIN BundleItem bi ON bi.bundleId = b.id
           WHERE b.storeId = ? AND b.active = 1
           GROUP BY b.id ORDER BY b.name`,
            [storeId],
          )
          const bundles = (rows as any[]).map(row => {
            const items = row.itemsRaw
              ? row.itemsRaw.split(',').map((s: string) => {
                  const [id, productId, qty] = s.split(':')
                  return { id, productId, qty: Number(qty) }
                })
              : []
            const { itemsRaw, ...rest } = row
            return { ...rest, items }
          })
          // Enrich with product names
          const productIds = [
            ...new Set(bundles.flatMap(b => b.items.map((i: any) => i.productId))),
          ]
          let products: any[] = []
          if (productIds.length > 0) {
            products = await query(
              `SELECT id, name, price, stock, trackStock FROM Product WHERE id IN (${productIds.map(() => '?').join(',')})`,
              productIds,
            )
          }
          const productMap = Object.fromEntries((products as any[]).map(p => [p.id, p]))
          const enriched = bundles.map(b => ({
            ...b,
            items: b.items.map((i: any) => ({ ...i, product: productMap[i.productId] ?? null })),
          }))
          return ok(enriched)
        }

        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || b.price === undefined) return err('name and price are required')
          const bid = newId()
          const t = nowISO()
          await exec(
            `INSERT INTO ProductBundle (id,storeId,name,description,price,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`,
            [
              bid,
              storeId,
              b.name,
              b.description ?? null,
              Number(b.price),
              b.active !== false ? 1 : 0,
              t,
              t,
            ],
          )
          const items: Array<{ productId: string; qty: number }> = b.items ?? []
          for (const item of items) {
            await exec(`INSERT INTO BundleItem (id,bundleId,productId,qty) VALUES (?,?,?,?)`, [
              newId(),
              bid,
              item.productId,
              Number(item.qty) || 1,
            ])
          }
          return ok({ id: bid, name: b.name, price: b.price }, 201)
        }
      }

      if (segs.length === 2) {
        const bundleId = segs[1]
        const bundle = await queryOne<any>(`SELECT * FROM ProductBundle WHERE id=? AND storeId=?`, [
          bundleId,
          storeId,
        ])
        if (!bundle) return err('Bundle not found', 404)

        if (method === 'PATCH') {
          const b: any = await req.json()
          const allowed = new Set(['name', 'description', 'price', 'active'])
          const cols = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.has(k)))
          const t = nowISO()
          if (Object.keys(cols).length > 0) {
            const { setClauses, values } = buildUpdate(cols)
            await exec(`UPDATE ProductBundle SET ${setClauses}, updatedAt=? WHERE id=?`, [
              ...values,
              t,
              bundleId,
            ])
          }
          // Replace items if provided
          if (Array.isArray(b.items)) {
            await exec(`DELETE FROM BundleItem WHERE bundleId=?`, [bundleId])
            for (const item of b.items as Array<{ productId: string; qty: number }>) {
              await exec(`INSERT INTO BundleItem (id,bundleId,productId,qty) VALUES (?,?,?,?)`, [
                newId(),
                bundleId,
                item.productId,
                Number(item.qty) || 1,
              ])
            }
          }
          return ok({ ok: true })
        }

        if (method === 'DELETE') {
          await exec(`DELETE FROM BundleItem WHERE bundleId=?`, [bundleId])
          await exec(`DELETE FROM ProductBundle WHERE id=?`, [bundleId])
          return ok({ ok: true })
        }
      }
    }

    // ─── PRODUCTS SEARCH ──────────────────────────────────────────────────────
    if (segs[0] === 'products' && segs[1] === 'search' && method === 'GET') {
      const q = sp.get('q') ?? ''
      if (!q.trim()) return ok([])
      const like = `%${q}%`
      const rows = await query(
        `SELECT p.*, c.name as categoryName, c.color as categoryColor
       FROM Product p LEFT JOIN Category c ON p.categoryId = c.id
       WHERE p.storeId=? AND p.active=1
         AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
       ORDER BY p.name LIMIT 50`,
        [storeId, like, like, like],
      )
      return ok(rows)
    }

    // ─── CUSTOMERS SEARCH ─────────────────────────────────────────────────────
    if (segs[0] === 'customers' && segs[1] === 'search' && method === 'GET') {
      const q = sp.get('q') ?? ''
      if (!q.trim()) return ok([])
      const like = `%${q}%`
      const rows = await query(
        `SELECT id, name, phone, email, address, points FROM Customer
       WHERE storeId=? AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
       ORDER BY name LIMIT 50`,
        [storeId, like, like, like],
      )
      return ok(rows)
    }

    // ─── HR ATTENDANCE (calendar view) ───────────────────────────────────────
    if (segs[0] === 'hr' && segs[1] === 'attendance' && method === 'GET') {
      const employeeId = sp.get('employeeId') ?? ''
      const month = parseInt(sp.get('month') ?? '0')
      const year = parseInt(sp.get('year') ?? '0')
      if (!employeeId) return err('employeeId required')
      if (!month || !year) return err('month and year required')
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const rows = await query(
        `SELECT a.*, e.name as employeeName FROM Attendance a
         JOIN Employee e ON a.employeeId = e.id
         WHERE a.storeId=? AND a.employeeId=? AND a.date >= ? AND a.date <= ?
         ORDER BY a.date`,
        [storeId, employeeId, from, to],
      )
      return ok(rows)
    }

    // ─── HR LEAVE ─────────────────────────────────────────────────────────────
    if (segs[0] === 'hr' && segs[1] === 'leave') {
      // GET /api/hr/leave — list leave requests
      if (!segs[2] && method === 'GET') {
        const employeeId = sp.get('employeeId') ?? ''
        let q = `SELECT l.*, e.name as employeeName FROM LeaveRequest l
                 JOIN Employee e ON l.employeeId = e.id
                 WHERE l.storeId=?`
        const params: any[] = [storeId]
        if (employeeId) {
          q += ` AND l.employeeId=?`
          params.push(employeeId)
        }
        q += ` ORDER BY l.createdAt DESC`
        return ok(await query(q, params))
      }

      // POST /api/hr/leave — submit new leave request
      if (!segs[2] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.employeeId) return err('employeeId wajib diisi')
        if (!b.startDate) return err('Tanggal mulai wajib diisi')
        if (!b.endDate) return err('Tanggal selesai wajib diisi')
        if (new Date(b.endDate) < new Date(b.startDate))
          return err('Tanggal selesai tidak boleh sebelum tanggal mulai')
        const validTypes = new Set(['ANNUAL', 'SICK', 'PERSONAL'])
        if (!validTypes.has(b.type)) return err('Tipe cuti tidak valid')
        if (!b.reason || b.reason.trim().length < 3) return err('Alasan minimal 3 karakter')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO LeaveRequest (id,storeId,employeeId,startDate,endDate,type,status,reason,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.employeeId,
            b.startDate,
            b.endDate,
            b.type,
            'PENDING',
            b.reason.trim(),
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }

      // PATCH /api/hr/leave/:id — approve or reject
      if (segs[2] && method === 'PATCH') {
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)
        const b = (await req.json()) as any
        const validStatuses = new Set(['APPROVED', 'REJECTED'])
        if (!b.status || !validStatuses.has(b.status))
          return err('Status harus APPROVED atau REJECTED')
        const leave = await queryOne<any>(`SELECT * FROM LeaveRequest WHERE id=? AND storeId=?`, [
          segs[2],
          storeId,
        ])
        if (!leave) return err('Leave request not found', 404)
        if (leave.status !== 'PENDING') return err('Hanya status PENDING yang bisa diubah')
        await exec(`UPDATE LeaveRequest SET status=?, updatedAt=? WHERE id=? AND storeId=?`, [
          b.status,
          nowISO(),
          segs[2],
          storeId,
        ])
        return ok({ success: true, status: b.status })
      }
    }

    // ─── AUDIT LOG ────────────────────────────────────────────────────────────
    if (segs[0] === 'audit') {
      if (method === 'GET') {
        // OWNER / SUPERADMIN only
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'SUPERADMIN'].includes(callerRole)) return err('Forbidden', 403)
        const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
        const action = sp.get('action') ?? undefined
        const result = await getAuditLogs({ storeId, page, pageSize: 20, action })
        return ok(result)
      }
    }

    return err('Not found', 404)
  } catch (e: any) {
    console.error('API error:', e)
    return err('Internal server error', 500)
  }
}
