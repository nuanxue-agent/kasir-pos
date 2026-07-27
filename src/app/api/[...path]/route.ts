import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, batchExec, newId, nowISO } from '@/lib/db'

function ok(data: any, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// ─── Allowlists for PATCH column names (prevent SQL injection) ────────────────

const ALLOWED_PRODUCT_COLS = new Set([
  'name', 'description', 'sku', 'barcode', 'price', 'cost',
  'categoryId', 'trackStock', 'stock', 'lowStock', 'active', 'image',
])
const ALLOWED_CUSTOMER_COLS = new Set(['name', 'phone', 'email', 'address', 'points'])
const ALLOWED_DISCOUNT_COLS = new Set([
  'name', 'code', 'type', 'value', 'minOrder', 'maxUses', 'startsAt', 'endsAt', 'active',
])
const ALLOWED_STORE_COLS = new Set([
  'name', 'address', 'phone', 'email', 'taxRate', 'currency', 'timezone', 'receiptNote',
])
const ALLOWED_USER_COLS = new Set(['name', 'email', 'password', 'role', 'active'])

function filterCols(body: Record<string, any>, allowed: Set<string>): Record<string, any> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)))
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols).map(k => `${k} = ?`).join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

// ─── Verify caller owns the store ─────────────────────────────────────────────

function assertStoreAccess(user: any, storeId: string): boolean {
  return user.stores?.some((s: any) => s.id === storeId) ?? false
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return handle(req, 'GET', path)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return handle(req, 'POST', path)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return handle(req, 'PATCH', path)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; return handle(req, 'DELETE', path)
}

async function handle(req: NextRequest, method: string, segs: string[]) {
  const url = new URL(req.url)
  const sp = url.searchParams

  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any
    const defaultStoreId = user.stores?.[0]?.id

    // ─── PRODUCTS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'products') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('search') ?? ''
          const catId = sp.get('categoryId')
          let sql = `SELECT p.*, c.name as categoryName, c.color as categoryColor
                     FROM Product p LEFT JOIN Category c ON p.categoryId = c.id
                     WHERE p.storeId = ? AND p.active = 1`
          const p: any[] = [storeId]
          if (catId) { sql += ' AND p.categoryId = ?'; p.push(catId) }
          if (search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; p.push(`%${search}%`, `%${search}%`) }
          sql += ' ORDER BY p.name'
          return ok(await query(sql, p))
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || b.price === undefined) return err('name and price are required')
          const pid = newId(); const t = nowISO()
          await exec(
            `INSERT INTO Product (id,storeId,name,price,description,sku,barcode,categoryId,cost,trackStock,stock,lowStock,active,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [pid, storeId, b.name, Number(b.price), b.description||null, b.sku||null, b.barcode||null,
             b.categoryId||null, Number(b.cost)||0, b.trackStock?1:0, Number(b.stock)||0, Number(b.lowStock)||5, b.active!==false?1:0, t, t])
          if ((Number(b.stock)||0) > 0)
            await exec(`INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [newId(), pid, 'INITIAL', Number(b.stock), 'Initial stock', t])
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
          await exec(`UPDATE Product SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...values, t, pid, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec('UPDATE Product SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?', [nowISO(), pid, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── CATEGORIES ───────────────────────────────────────────────────────────
    if (segs[0] === 'categories') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)
      if (method === 'GET') return ok(await query(
        `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`, [storeId]))
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'orders') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET') {
          const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
          const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
          const offset = (page - 1) * limit
          const status = sp.get('status'); const dateFrom = sp.get('dateFrom'); const dateTo = sp.get('dateTo')
          // Validate status value against allowlist
          const validStatuses = new Set(['PAID', 'PENDING', 'VOIDED', 'REFUNDED'])
          let sql = `SELECT o.*, u.name as userName, c.name as customerName
                     FROM "Order" o LEFT JOIN User u ON o.userId = u.id
                     LEFT JOIN Customer c ON o.customerId = c.id WHERE o.storeId = ?`
          const p: any[] = [storeId]
          if (status && validStatuses.has(status)) { sql += ' AND o.status = ?'; p.push(status) }
          if (dateFrom) { sql += ' AND o.createdAt >= ?'; p.push(dateFrom) }
          if (dateTo) { sql += ' AND o.createdAt <= ?'; p.push(dateTo) }
          sql += ' ORDER BY o.createdAt DESC LIMIT ? OFFSET ?'; p.push(limit, offset)
          const orders = await query(sql, p)
          const enriched = await Promise.all(orders.map(async (o: any) => ({
            ...o,
            items: await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [o.id]),
            payments: await query(`SELECT * FROM Payment WHERE orderId = ?`, [o.id]),
          })))
          return ok(enriched)
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.items?.length) return err('Order must have at least one item')
          if (!b.payments?.length) return err('Order must have at least one payment')
          const oid = newId(); const t = nowISO()
          const number = `INV-${Date.now()}`
          const stmts: Array<{ sql: string; params: any[] }> = [
            { sql: `INSERT INTO "Order" (id,storeId,number,status,userId,customerId,discountId,subtotal,discountAmt,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              params: [oid, storeId, number, 'PAID', user.id, b.customerId||null, b.discountId||null,
                       Number(b.subtotal)||0, Number(b.discountAmt)||0, Number(b.taxAmt)||0, Number(b.total)||0, b.note||null, t, t] }
          ]
          for (const item of (b.items || [])) {
            stmts.push({ sql: `INSERT INTO OrderItem (id,orderId,productId,variantId,name,variantName,price,qty,discount,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [newId(), oid, item.productId, item.variantId||null, item.name, item.variantName||null,
                       Number(item.price), Number(item.qty), Number(item.discount)||0, Number(item.subtotal)] })
            if (item.productId) {
              stmts.push({ sql: `UPDATE Product SET stock = stock - ? WHERE id = ? AND storeId = ?`, params: [Number(item.qty), item.productId, storeId] })
              stmts.push({ sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
                params: [newId(), item.productId, 'SALE', -Number(item.qty), `Order ${number}`, t] })
            }
          }
          const validPayMethods = new Set(['CASH', 'CARD', 'TRANSFER', 'QRIS', 'OTHER'])
          for (const pay of (b.payments || [])) {
            if (!validPayMethods.has(pay.method)) continue
            stmts.push({ sql: `INSERT INTO Payment (id,orderId,method,amount,reference,change,createdAt) VALUES (?,?,?,?,?,?,?)`,
              params: [newId(), oid, pay.method, Number(pay.amount), pay.reference||null, Number(pay.change)||0, t] })
          }
          await batchExec(stmts)
          // ── Points: award earned, subtract redeemed ──────────────────────
          let pointsEarned = 0
          if (b.customerId) {
            const redeemed = Math.max(0, Number(b.pointsRedeemed) || 0)
            pointsEarned = Math.floor(Number(b.total) / 1000)
            const net = pointsEarned - redeemed
            if (net !== 0) {
              await exec(
                `UPDATE Customer SET points = MAX(0, points + ?), updatedAt = ? WHERE id = ? AND storeId = ?`,
                [net, t, b.customerId, storeId]
              )
            }
          }
          // Return full order with items and payments for receipt display
          const orderItems = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
          const orderPayments = await query(`SELECT * FROM Payment WHERE orderId = ?`, [oid])
          return ok({
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
          }, 201)
        }
      }
      if (segs.length === 3 && segs[2] === 'void' && method === 'POST') {
        const oid = segs[1]
        const order = await queryOne(`SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [oid, storeId])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PAID') return err('Only PAID orders can be voided', 400)
        const items = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
        const t = nowISO()
        const stmts: Array<{ sql: string; params: any[] }> = [
          { sql: `UPDATE "Order" SET status = 'VOIDED', updatedAt = ? WHERE id = ?`, params: [t, oid] }
        ]
        for (const item of items) {
          stmts.push({ sql: `UPDATE Product SET stock = stock + ? WHERE id = ?`, params: [item.qty, item.productId] })
          stmts.push({ sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
            params: [newId(), item.productId, 'VOID', item.qty, `Void ${order.number}`, t] })
        }
        await batchExec(stmts)
        return ok({ success: true, status: 'VOIDED' })
      }
    }

    // ─── CUSTOMERS ────────────────────────────────────────────────────────────
    if (segs[0] === 'customers') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('q') ?? ''
          const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
          const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
          let sql = `SELECT * FROM Customer WHERE storeId = ?`
          const p: any[] = [storeId]
          if (search) { sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`) }
          sql += ' ORDER BY name LIMIT ? OFFSET ?'; p.push(limit, (page - 1) * limit)
          return ok(await query(sql, p))
        }
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name) return err('name is required')
          const cid = newId(); const t = nowISO()
          await exec(`INSERT INTO Customer (id,storeId,name,phone,email,address,points,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`,
            [cid, storeId, b.name, b.phone||null, b.email||null, b.address||null, 0, t, t])
          return ok({ id: cid, name: b.name }, 201)
        }
      }
      if (segs.length === 2) {
        const cid = segs[1]
        if (method === 'GET') {
          const customer = await queryOne(`SELECT * FROM Customer WHERE id = ? AND storeId = ?`, [cid, storeId])
          if (!customer) return err('Not found', 404)
          const orders = await query(`SELECT * FROM "Order" WHERE customerId = ? ORDER BY createdAt DESC LIMIT 10`, [cid])
          return ok({ ...customer, orders })
        }
        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_CUSTOMER_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(`UPDATE Customer SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`, [...values, t, cid, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          const cnt: any = await queryOne(`SELECT COUNT(*) as c FROM "Order" WHERE customerId = ?`, [cid])
          if ((cnt?.c ?? 0) > 0) return err('Cannot delete customer with orders', 400)
          await exec(`DELETE FROM Customer WHERE id = ? AND storeId = ?`, [cid, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── INVENTORY ────────────────────────────────────────────────────────────
    if (segs[0] === 'inventory') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)

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
        const pid = segs[1]; const t = nowISO()
        // Verify product belongs to store
        const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [pid, storeId])
        if (!product) return err('Product not found', 404)
        await exec(`UPDATE Product SET stock = stock + ?, updatedAt = ? WHERE id = ? AND storeId = ?`, [Number(b.qty), t, pid, storeId])
        await exec(`INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`, [newId(), pid, b.type, Number(b.qty), b.note||null, t])
        return ok(await queryOne(`SELECT * FROM Product WHERE id = ?`, [pid]))
      }
      if (segs.length === 3 && segs[2] === 'logs' && method === 'GET') {
        // Verify product belongs to store
        const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [segs[1], storeId])
        if (!product) return err('Product not found', 404)
        return ok(await query(`SELECT * FROM StockLog WHERE productId = ? ORDER BY createdAt DESC LIMIT 50`, [segs[1]]))
      }
    }

    // ─── DISCOUNTS ────────────────────────────────────────────────────────────
    if (segs[0] === 'discounts') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET') return ok(await query(`SELECT * FROM Discount WHERE storeId = ? ORDER BY createdAt DESC`, [storeId]))
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || !b.type || b.value === undefined) return err('name, type and value are required')
          const validTypes = new Set(['PERCENTAGE', 'FIXED'])
          if (!validTypes.has(b.type)) return err('Invalid discount type')
          const did = newId(); const t = nowISO()
          await exec(`INSERT INTO Discount (id,storeId,name,code,type,value,minOrder,maxUses,usedCount,startsAt,endsAt,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [did, storeId, b.name, b.code||null, b.type, Number(b.value), Number(b.minOrder)||0, b.maxUses||null, 0, b.startsAt||null, b.endsAt||null, 1, t, t])
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
          await exec(`UPDATE Discount SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`, [...values, t, did, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await exec(`UPDATE Discount SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?`, [nowISO(), did, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── STAFF ────────────────────────────────────────────────────────────────
    if (segs[0] === 'staff') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)
      // Only OWNER or MANAGER can manage staff
      const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
      if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)

      if (segs.length === 1) {
        if (method === 'GET') return ok(await query(
          `SELECT u.id, u.name, u.email, u.role, u.active, su.role as storeRole FROM User u
           JOIN StoreUser su ON u.id = su.userId WHERE su.storeId = ? ORDER BY u.name`, [storeId]))
        if (method === 'POST') {
          const b: any = await req.json()
          if (!b.name || !b.email || !b.password) return err('name, email and password are required')
          const validRoles = new Set(['MANAGER', 'CASHIER'])
          if (b.role && !validRoles.has(b.role)) return err('Invalid role')
          const existing = await queryOne(`SELECT id FROM User WHERE email = ?`, [b.email])
          if (existing) return err('Email already in use', 409)
          const uid = newId(); const t = nowISO()
          const bcryptLib = await import('bcryptjs')
          const pwd = await bcryptLib.hash(b.password, 10)
          await batchExec([
            { sql: `INSERT INTO User (id,tenantId,name,email,password,role,active,isSuperAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [uid, user.tenantId||null, b.name, b.email, pwd, b.role||'CASHIER', 1, 0, t, t] },
            { sql: `INSERT INTO StoreUser (id,storeId,userId,role) VALUES (?,?,?,?)`,
              params: [newId(), storeId, uid, b.role||'CASHIER'] }
          ])
          return ok({ id: uid, name: b.name, email: b.email, role: b.role||'CASHIER' }, 201)
        }
      }
      if (segs.length === 2) {
        const uid = segs[1]
        // Verify target user belongs to same store
        const membership = await queryOne(`SELECT role FROM StoreUser WHERE userId = ? AND storeId = ?`, [uid, storeId])
        if (!membership) return err('Staff member not found', 404)
        // OWNER cannot be modified by MANAGER
        if (membership.role === 'OWNER' && callerRole !== 'OWNER') return err('Forbidden', 403)

        if (method === 'PATCH') {
          const raw: any = await req.json()
          const b = filterCols(raw, ALLOWED_USER_COLS)
          if (Object.keys(b).length === 0) return err('No valid fields to update')
          if (b.password) { const bcryptLib = await import('bcryptjs'); b.password = await bcryptLib.hash(String(b.password), 10) }
          if (b.role) {
            const validRoles = new Set(['MANAGER', 'CASHIER'])
            if (!validRoles.has(b.role)) return err('Invalid role')
          }
          const t = nowISO()
          const { setClauses, values } = buildUpdate(b)
          await exec(`UPDATE User SET ${setClauses}, updatedAt = ? WHERE id = ?`, [...values, t, uid])
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
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)
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
        await exec(`UPDATE Store SET ${setClauses}, updatedAt = ? WHERE id = ?`, [...values, t, storeId])
        return ok({ success: true })
      }
    }

    // ─── REPORTS ──────────────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'summary' && method === 'GET') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (!assertStoreAccess(user, storeId)) return err('Forbidden', 403)
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()
      const [revenue, daily, topProducts, payments, customers] = await Promise.all([
        queryOne(`SELECT SUM(total) as totalRevenue, COUNT(*) as totalOrders, AVG(total) as avgOrderValue FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`, [storeId, from, to]),
        query(`SELECT DATE(createdAt) as date, SUM(total) as total, COUNT(*) as orders FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY date`, [storeId, from, to]),
        query(`SELECT oi.name, SUM(oi.subtotal) as revenue, SUM(oi.qty) as qty FROM OrderItem oi JOIN "Order" o ON oi.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY oi.name ORDER BY revenue DESC LIMIT 5`, [storeId, from, to]),
        query(`SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY p.method`, [storeId, from, to]),
        queryOne(`SELECT COUNT(*) as newCustomers FROM Customer WHERE storeId=? AND createdAt BETWEEN ? AND ?`, [storeId, from, to]),
      ])
      return ok({ totalRevenue: (revenue as any)?.totalRevenue ?? 0, totalOrders: (revenue as any)?.totalOrders ?? 0, avgOrderValue: (revenue as any)?.avgOrderValue ?? 0, newCustomers: (customers as any)?.newCustomers ?? 0, dailySales: daily, topProducts, paymentBreakdown: payments })
    }

    return err('Not found', 404)
  } catch (e: any) {
    console.error('API error:', e)
    // Don't leak internal error details to clients
    return err('Internal server error', 500)
  }
}
