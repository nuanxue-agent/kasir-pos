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
  'name', 'address', 'phone', 'email', 'taxRate', 'currency', 'timezone', 'receiptNote', 'modules',
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
      if (method === 'GET') return ok(await query(
        `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`, [storeId]))
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'orders') {

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
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()
      const [revenue, daily, topProducts, payments, customers, expenses] = await Promise.all([
        queryOne(`SELECT SUM(total) as totalRevenue, COUNT(*) as totalOrders, AVG(total) as avgOrderValue FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`, [storeId, from, to]),
        query(`SELECT DATE(createdAt) as date, SUM(total) as total, COUNT(*) as orders FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY date`, [storeId, from, to]),
        query(`SELECT oi.name, SUM(oi.subtotal) as revenue, SUM(oi.qty) as qty FROM OrderItem oi JOIN "Order" o ON oi.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY oi.name ORDER BY revenue DESC LIMIT 5`, [storeId, from, to]),
        query(`SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND o.createdAt BETWEEN ? AND ? GROUP BY p.method`, [storeId, from, to]),
        queryOne(`SELECT COUNT(*) as newCustomers FROM Customer WHERE storeId=? AND createdAt BETWEEN ? AND ?`, [storeId, from, to]),
        queryOne(`SELECT COALESCE(SUM(amount),0) as totalExpenses FROM Expense WHERE storeId=? AND date BETWEEN ? AND ?`, [storeId, from.slice(0,10), to.slice(0,10)]),
      ])
      const totalRevenue = (revenue as any)?.totalRevenue ?? 0
      const totalExpenses = (expenses as any)?.totalExpenses ?? 0
      return ok({ totalRevenue, totalOrders: (revenue as any)?.totalOrders ?? 0, avgOrderValue: (revenue as any)?.avgOrderValue ?? 0, newCustomers: (customers as any)?.newCustomers ?? 0, totalExpenses, netProfit: totalRevenue - totalExpenses, dailySales: daily, topProducts, paymentBreakdown: payments })
    }

    // ─── EXPENSES ─────────────────────────────────────────────────────────────
    if (segs[0] === 'expenses') {
      if (method === 'GET') {
        const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
        const to   = sp.get('to')   ?? new Date().toISOString()
        const rows = await query(
          `SELECT * FROM Expense WHERE storeId=? AND date BETWEEN ? AND ? ORDER BY date DESC, createdAt DESC`,
          [storeId, from.slice(0,10), to.slice(0,10)]
        )
        return ok(rows)
      }
      if (method === 'POST') {
        const b = await req.json() as any
        if (!b.description || !b.amount || !b.date) return err('Missing required fields')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Expense (id,storeId,userId,category,description,amount,date,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, storeId, user.id, b.category ?? 'Lain-lain', b.description, Number(b.amount), b.date, b.note ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['category','description','amount','date','note'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Expense SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
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
          const shift = await queryOne(`SELECT * FROM Shift WHERE storeId=? AND status='OPEN' ORDER BY openedAt DESC LIMIT 1`, [storeId])
          return ok(shift ?? null)
        }
        const rows = await query(`SELECT s.*, u.name as userName FROM Shift s JOIN User u ON s.userId=u.id WHERE s.storeId=? ORDER BY s.openedAt DESC LIMIT 30`, [storeId])
        return ok(rows)
      }
      if (method === 'POST') {
        // Open a new shift
        const b = await req.json() as any
        // Close any existing open shift first
        await exec(`UPDATE Shift SET status='CLOSED', closedAt=?, updatedAt=? WHERE storeId=? AND status='OPEN'`, [nowISO(), nowISO(), storeId])
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Shift (id,storeId,userId,openingCash,status,openedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`,
          [id, storeId, user.id, Number(b.openingCash ?? 0), 'OPEN', t, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        // Close shift
        const b = await req.json() as any
        const shift = await queryOne<any>(`SELECT * FROM Shift WHERE id=? AND storeId=?`, [segs[1], storeId])
        if (!shift) return err('Shift not found', 404)
        const cashRevenue = await queryOne<any>(
          `SELECT COALESCE(SUM(p.amount),0) as total FROM Payment p JOIN "Order" o ON p.orderId=o.id WHERE o.storeId=? AND o.status='PAID' AND p.method='CASH' AND o.createdAt >= ?`,
          [storeId, shift.openedAt]
        )
        const expectedCash = (shift.openingCash ?? 0) + (cashRevenue?.total ?? 0)
        await exec(
          `UPDATE Shift SET status=?,closedAt=?,closingCash=?,expectedCash=?,note=?,updatedAt=? WHERE id=? AND storeId=?`,
          ['CLOSED', nowISO(), Number(b.closingCash ?? 0), expectedCash, b.note ?? null, nowISO(), segs[1], storeId]
        )
        return ok({ success: true, expectedCash })
      }
    }

    // ─── VARIANTS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'variants') {
      const productId = sp.get('productId')
      if (method === 'GET') {
        if (!productId) return err('productId required')
        const rows = await query(`SELECT * FROM ProductVariant WHERE productId=? AND storeId=? ORDER BY name`, [productId, storeId])
        return ok(rows)
      }
      if (method === 'POST') {
        const b = await req.json() as any
        if (!b.productId || !b.name) return err('Missing required fields')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO ProductVariant (id,productId,storeId,name,sku,price,stock,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, b.productId, storeId, b.name, b.sku ?? null, b.price != null ? Number(b.price) : null, Number(b.stock ?? 0), 1, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['name','sku','price','stock','active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE ProductVariant SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
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
          ? await query(`SELECT * FROM Supplier WHERE storeId=? AND active=1 AND name LIKE ? ORDER BY name`, [storeId, `%${search}%`])
          : await query(`SELECT * FROM Supplier WHERE storeId=? AND active=1 ORDER BY name`, [storeId])
        return ok(rows)
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.name || b.name.trim().length < 2) return err('Nama supplier minimal 2 karakter')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Supplier (id,storeId,name,email,phone,address,taxId,notes,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,1,?,?)`,
          [id, storeId, b.name.trim(), b.email ?? null, b.phone ?? null, b.address ?? null, b.taxId ?? null, b.notes ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['name','email','phone','address','taxId','notes','active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Supplier SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`UPDATE Supplier SET active=0, updatedAt=? WHERE id=? AND storeId=?`, [nowISO(), segs[1], storeId])
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
          status ? [storeId, status, limit, offset] : [storeId, limit, offset]
        )
        const total = await queryOne<any>(`SELECT COUNT(*) as count FROM PurchaseOrder WHERE storeId=? ${status ? 'AND status=?' : ''}`,
          status ? [storeId, status] : [storeId])
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
        const b = await req.json() as any
        if (!b.supplierId) return err('Supplier harus dipilih')
        if (!b.lines || !Array.isArray(b.lines) || b.lines.length === 0) return err('Minimal 1 item')
        // Generate PO number
        const count = await queryOne<any>(`SELECT COUNT(*) as c FROM PurchaseOrder WHERE storeId=?`, [storeId])
        const num = `PO-${String((count?.c ?? 0) + 1).padStart(4, '0')}`
        const t = nowISO(); const id = newId()
        const subtotal = b.lines.reduce((s: number, l: any) => s + (Number(l.qty) * Number(l.unitCost)), 0)
        const taxAmt = Math.round(subtotal * (b.taxRate ?? 0))
        const total = subtotal + taxAmt
        await exec(
          `INSERT INTO PurchaseOrder (id,storeId,supplierId,userId,number,status,expectedDate,subtotal,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?)`,
          [id, storeId, b.supplierId, user.id, num, b.expectedDate ?? null, subtotal, taxAmt, total, b.note ?? null, t, t]
        )
        for (const line of b.lines) {
          await exec(
            `INSERT INTO PurchaseOrderLine (id,orderId,productId,productName,qty,unitCost,receivedQty,subtotal,createdAt) VALUES (?,?,?,?,?,?,0,?,?)`,
            [newId(), id, line.productId, line.productName ?? '', Number(line.qty), Number(line.unitCost), Number(line.qty) * Number(line.unitCost), t]
          )
        }
        return ok({ id, number: num }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        // Status change
        if (b.status) {
          const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [segs[1], storeId])
          if (!po) return err('PO not found', 404)
          await exec(`UPDATE PurchaseOrder SET status=?, updatedAt=? WHERE id=? AND storeId=?`, [b.status, nowISO(), segs[1], storeId])
          return ok({ success: true })
        }
        // Goods receipt — receive items
        if (b.receive && Array.isArray(b.receive)) {
          const po = await queryOne<any>(`SELECT * FROM PurchaseOrder WHERE id=? AND storeId=?`, [segs[1], storeId])
          if (!po) return err('PO not found', 404)
          if (!['SENT','CONFIRMED'].includes(po.status)) return err('PO tidak bisa diterima dalam status ini')
          const t = nowISO(); const receiptId = newId()
          const grNum = `GR-${Date.now().toString(36).toUpperCase()}`
          await exec(
            `INSERT INTO GoodsReceipt (id,storeId,orderId,userId,number,note,createdAt) VALUES (?,?,?,?,?,?,?)`,
            [receiptId, storeId, segs[1], user.id, grNum, b.note ?? null, t]
          )
          let allReceived = true
          for (const item of b.receive) {
            if (!item.lineId || !item.qty || item.qty <= 0) continue
            const line = await queryOne<any>(`SELECT * FROM PurchaseOrderLine WHERE id=?`, [item.lineId])
            if (!line) continue
            const newReceived = line.receivedQty + Number(item.qty)
            await exec(`UPDATE PurchaseOrderLine SET receivedQty=? WHERE id=?`, [newReceived, item.lineId])
            await exec(`INSERT INTO GoodsReceiptLine (id,receiptId,lineId,productId,qty) VALUES (?,?,?,?,?)`,
              [newId(), receiptId, item.lineId, line.productId, Number(item.qty)])
            // Update product stock
            await exec(`UPDATE Product SET stock = stock + ?, updatedAt=? WHERE id=? AND storeId=?`,
              [Number(item.qty), t, line.productId, storeId])
            await exec(`INSERT INTO StockLog (id,storeId,productId,userId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
              [newId(), storeId, line.productId, user.id, 'PURCHASE', Number(item.qty), `GR: ${grNum}`, t])
            if (newReceived < line.qty) allReceived = false
          }
          // Check all lines received
          const allLines = await query<any>(`SELECT * FROM PurchaseOrderLine WHERE orderId=?`, [segs[1]])
          const fullyReceived = allLines.every((l: any) => l.receivedQty >= l.qty)
          if (fullyReceived) {
            await exec(`UPDATE PurchaseOrder SET status='RECEIVED', updatedAt=? WHERE id=?`, [t, segs[1]])
          }
          return ok({ receiptId, number: grNum })
        }
        return err('No valid update')
      }
      if (segs[1] && method === 'DELETE') {
        const po = await queryOne<any>(`SELECT status FROM PurchaseOrder WHERE id=? AND storeId=?`, [segs[1], storeId])
        if (!po) return err('PO not found', 404)
        if (!['DRAFT','CANCELLED'].includes(po.status)) return err('Hanya PO DRAFT yang bisa dihapus')
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
          ? await query(`SELECT * FROM Account WHERE storeId=? AND active=1 AND type=? ORDER BY code`, [storeId, type])
          : await query(`SELECT * FROM Account WHERE storeId=? AND active=1 ORDER BY code`, [storeId])
        // Also include system accounts from demo store for new tenants without seeded accounts
        if ((rows as any[]).length === 0) {
          const demo = await query(`SELECT * FROM Account WHERE storeId='store_demo' AND active=1 ORDER BY code`, [])
          return ok(demo)
        }
        return ok(rows)
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.code || !/^\d{3,6}$/.test(b.code)) return err('Kode akun harus 3-6 digit angka')
        if (!b.name || b.name.trim().length < 2) return err('Nama akun minimal 2 karakter')
        if (!b.type) return err('Tipe akun harus diisi')
        const normalBalance = ['ASSET','EXPENSE'].includes(b.type) ? 'DEBIT' : 'CREDIT'
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Account (id,storeId,code,name,type,normalBalance,parentId,balance,active,isSystem,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,0,1,0,?,?)`,
          [id, storeId, b.code, b.name.trim(), b.type, normalBalance, b.parentId ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['name','type','parentId','active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Account SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
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
        if (from) { q += ' AND date >= ?'; params.push(from) }
        if (to) { q += ' AND date <= ?'; params.push(to) }
        if (status) { q += ' AND status=?'; params.push(status) }
        q += ' ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?'
        params.push(limit, offset)
        const entries = await query(q, params)
        return ok(entries)
      }
      if (segs[1] === 'lines' && method === 'GET') {
        const entryId = url.searchParams.get('entryId')
        if (!entryId) return err('entryId required')
        const lines = await query(
          `SELECT jl.*, a.code, a.name as accountName FROM JournalLine jl JOIN Account a ON jl.accountId=a.id WHERE jl.entryId=? ORDER BY jl.debit DESC`,
          [entryId]
        )
        return ok(lines)
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.date) return err('Tanggal harus diisi')
        if (!b.description || b.description.trim().length < 2) return err('Deskripsi minimal 2 karakter')
        if (!b.lines || b.lines.length < 2) return err('Minimal 2 baris jurnal')
        const totalDebit = b.lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0)
        const totalCredit = b.lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01) return err('Jurnal tidak balance (debit ≠ kredit)')
        for (const line of b.lines) {
          if (Number(line.debit ?? 0) < 0 || Number(line.credit ?? 0) < 0) return err('Nilai tidak boleh negatif')
          if (Number(line.debit ?? 0) === 0 && Number(line.credit ?? 0) === 0) return err('Baris tidak boleh nol semua')
        }
        const count = await queryOne<any>(`SELECT COUNT(*) as c FROM JournalEntry WHERE storeId=?`, [storeId])
        const num = `JE-${String((count?.c ?? 0) + 1).padStart(5, '0')}`
        const t = nowISO(); const id = newId()
        await exec(
          `INSERT INTO JournalEntry (id,storeId,userId,number,date,description,reference,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, storeId, user.id, num, b.date, b.description.trim(), b.reference ?? null, b.status ?? 'DRAFT', t, t]
        )
        for (const line of b.lines) {
          await exec(
            `INSERT INTO JournalLine (id,entryId,accountId,debit,credit,description,createdAt) VALUES (?,?,?,?,?,?,?)`,
            [newId(), id, line.accountId, Number(line.debit ?? 0), Number(line.credit ?? 0), line.description ?? null, t]
          )
        }
        return ok({ id, number: num }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const entry = await queryOne<any>(`SELECT * FROM JournalEntry WHERE id=? AND storeId=?`, [segs[1], storeId])
        if (!entry) return err('Entry not found', 404)
        if (entry.status === 'POSTED' && b.status !== 'VOIDED') return err('Entry sudah diposting, tidak bisa diedit')
        await exec(`UPDATE JournalEntry SET status=?, updatedAt=? WHERE id=? AND storeId=?`, [b.status, nowISO(), segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── Financial Reports ─────────────────────────────────────────────────────
    if (segs[0] === 'financial-reports') {
      const from = url.searchParams.get('from') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)
      const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0,10)

      if (segs[1] === 'pnl') {
        const accounts = await query<any>(`SELECT * FROM Account WHERE storeId=? OR storeId='store_demo' AND active=1`, [storeId])
        const entries = await query<any>(
          `SELECT je.id, je.date FROM JournalEntry je WHERE (je.storeId=? OR je.storeId='store_demo') AND je.status='POSTED' AND je.date BETWEEN ? AND ?`,
          [storeId, from, to]
        )
        const allLines = await Promise.all(entries.map((e: any) =>
          query<any>(`SELECT * FROM JournalLine WHERE entryId=?`, [e.id])
        ))
        const flatLines = allLines.flat()

        let revenue = 0; let expenses = 0
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
          [storeId, from, to]
        )
        expenses += expenseRecords?.total ?? 0

        // Factor in POS revenue
        const posRevenue = await queryOne<any>(
          `SELECT COALESCE(SUM(total),0) as total FROM "Order" WHERE storeId=? AND status='PAID' AND createdAt BETWEEN ? AND ?`,
          [storeId, `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`]
        )
        revenue += posRevenue?.total ?? 0

        return ok({ from, to, revenue, expenses, netProfit: revenue - expenses })
      }

      if (segs[1] === 'balance-sheet') {
        const storeAccs = await query<any>(`SELECT * FROM Account WHERE (storeId=? OR storeId='store_demo') AND active=1`, [storeId])
        const lines = await query<any>(
          `SELECT jl.* FROM JournalLine jl
           JOIN JournalEntry je ON jl.entryId=je.id
           WHERE (je.storeId=? OR je.storeId='store_demo') AND je.status='POSTED' AND je.date <= ?`,
          [storeId, to]
        )

        const result: Record<string, { code: string; name: string; balance: number }[]> = {
          ASSET: [], LIABILITY: [], EQUITY: []
        }
        for (const acc of storeAccs.filter((a: any) => ['ASSET','LIABILITY','EQUITY'].includes(a.type))) {
          const accLines = lines.filter((l: any) => l.accountId === acc.id)
          const nb = acc.normalBalance
          const balance = acc.balance + accLines.reduce((s: number, l: any) =>
            nb === 'DEBIT' ? s + l.debit - l.credit : s + l.credit - l.debit, 0)
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
        if (search) { q += ` AND (name LIKE ? OR position LIKE ? OR nik LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
        if (dept) { q += ` AND department=?`; params.push(dept) }
        q += ` ORDER BY name`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.name || b.name.trim().length < 2) return err('Nama karyawan minimal 2 karakter')
        if (!b.position || b.position.trim().length < 2) return err('Posisi harus diisi')
        if (b.baseSalary == null || Number(b.baseSalary) < 0) return err('Gaji pokok tidak boleh negatif')
        if (!b.joinDate) return err('Tanggal bergabung harus diisi')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Employee (id,storeId,userId,name,nik,position,department,baseSalary,employmentStatus,employmentType,joinDate,phone,email,address,bankName,bankAccount,bankAccountName,notes,active,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
          [id, storeId, b.userId ?? null, b.name.trim(), b.nik ?? null, b.position.trim(), b.department ?? null,
           Number(b.baseSalary), b.employmentStatus ?? 'ACTIVE', b.employmentType ?? 'FULL_TIME',
           b.joinDate, b.phone ?? null, b.email ?? null, b.address ?? null,
           b.bankName ?? null, b.bankAccount ?? null, b.bankAccountName ?? null, b.notes ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'GET') {
        const emp = await queryOne(`SELECT * FROM Employee WHERE id=? AND storeId=?`, [segs[1], storeId])
        if (!emp) return err('Employee not found', 404)
        return ok(emp)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['name','nik','position','department','baseSalary','employmentStatus','employmentType','joinDate','endDate','phone','email','address','bankName','bankAccount','bankAccountName','notes','active'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Employee SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
        return ok({ success: true })
      }
      if (segs[1] && method === 'DELETE') {
        await exec(`UPDATE Employee SET active=0, employmentStatus='TERMINATED', updatedAt=? WHERE id=? AND storeId=?`, [nowISO(), segs[1], storeId])
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
        if (employeeId) { q += ` AND a.employeeId=?`; params.push(employeeId) }
        if (from) { q += ` AND a.date >= ?`; params.push(from) }
        if (to) { q += ` AND a.date <= ?`; params.push(to) }
        q += ` ORDER BY a.date DESC, e.name`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.employeeId || !b.date) return err('employeeId and date required')
        // Calculate late minutes
        let lateMinutes = 0
        if (b.checkIn && b.scheduleStart) {
          const [ch, cm] = b.checkIn.split(':').map(Number)
          const [sh, sm] = b.scheduleStart.split(':').map(Number)
          lateMinutes = Math.max(0, (ch * 60 + cm) - (sh * 60 + sm))
        }
        const status = !b.checkIn ? 'ABSENT' : lateMinutes > 15 ? 'LATE' : 'PRESENT'
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT OR REPLACE INTO Attendance (id,storeId,employeeId,date,checkIn,checkOut,status,lateMinutes,overtimeMinutes,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, storeId, b.employeeId, b.date, b.checkIn ?? null, b.checkOut ?? null, b.status ?? status, lateMinutes, b.overtimeMinutes ?? 0, b.note ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['checkIn','checkOut','status','lateMinutes','overtimeMinutes','note'])
        const cols = filterCols(b, allowed)
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Attendance SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── Payroll ────────────────────────────────────────────────────────────────
    if (segs[0] === 'payroll') {
      if (!segs[1] && method === 'GET') {
        const runs = await query(`SELECT * FROM PayrollRun WHERE storeId=? ORDER BY period DESC LIMIT 24`, [storeId])
        return ok(runs)
      }
      if (segs[1] === 'payslips' && method === 'GET') {
        const runId = url.searchParams.get('runId')
        const employeeId = url.searchParams.get('employeeId')
        let q = `SELECT p.*, e.name as employeeName, e.position FROM Payslip p JOIN Employee e ON p.employeeId=e.id WHERE p.storeId=?`
        const params: any[] = [storeId]
        if (runId) { q += ` AND p.runId=?`; params.push(runId) }
        if (employeeId) { q += ` AND p.employeeId=?`; params.push(employeeId) }
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        // Generate payroll run for a period
        const b = await req.json() as any
        if (!b.period) return err('Period harus diisi (format: YYYY-MM)')
        const employees = await query<any>(`SELECT * FROM Employee WHERE storeId=? AND active=1 AND employmentStatus='ACTIVE'`, [storeId])
        if ((employees as any[]).length === 0) return err('Tidak ada karyawan aktif')
        const t = nowISO(); const runId = newId()
        let totalGross = 0; let totalDed = 0; let totalNet = 0

        // Calculate working days for the period
        const [yr, mo] = b.period.split('-').map(Number)
        const firstDay = `${b.period}-01`
        const lastDay = new Date(yr, mo, 0).toISOString().slice(0, 10)

        await exec(
          `INSERT INTO PayrollRun (id,storeId,userId,period,status,totalGross,totalDeductions,totalNet,note,createdAt,updatedAt) VALUES (?,?,?,?,'DRAFT',0,0,0,?,?,?)`,
          [runId, storeId, user.id, b.period, b.note ?? null, t, t]
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

          totalGross += gross; totalDed += totalDeduct; totalNet += net

          await exec(
            `INSERT INTO Payslip (id,runId,employeeId,storeId,period,baseSalary,allowances,deductions,grossSalary,totalDeductions,netSalary,workedDays,workingDays,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [newId(), runId, emp.id, storeId, b.period, emp.baseSalary, JSON.stringify(allowances), JSON.stringify(deductions), gross, totalDeduct, net, 0, 0, 'DRAFT', t, t]
          )
        }
        await exec(`UPDATE PayrollRun SET totalGross=?, totalDeductions=?, totalNet=?, updatedAt=? WHERE id=?`,
          [totalGross, totalDed, totalNet, t, runId])
        return ok({ runId, totalGross, totalNet, employeeCount: (employees as any[]).length }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        await exec(`UPDATE PayrollRun SET status=?, paidAt=?, updatedAt=? WHERE id=? AND storeId=?`,
          [b.status, b.status === 'PAID' ? nowISO() : null, nowISO(), segs[1], storeId])
        if (b.status === 'PAID') {
          await exec(`UPDATE Payslip SET status='PAID', paidAt=?, updatedAt=? WHERE runId=?`,
            [nowISO(), nowISO(), segs[1]])
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
        if (status) { q += ` AND status=?`; params.push(status) }
        if (search) { q += ` AND (name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
        q += ` ORDER BY priority DESC, createdAt DESC`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.name || b.name.trim().length < 2) return err('Nama lead minimal 2 karakter')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO Lead (id,storeId,name,company,email,phone,source,status,priority,value,probability,expectedCloseDate,assignedTo,notes,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, storeId, b.name.trim(), b.company ?? null, b.email ?? null, b.phone ?? null, b.source ?? null,
           b.status ?? 'NEW', b.priority ?? 'MEDIUM', Number(b.value ?? 0), Number(b.probability ?? 10),
           b.expectedCloseDate ?? null, b.assignedTo ?? null, b.notes ?? null, b.tags ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'GET') {
        const lead = await queryOne(`SELECT * FROM Lead WHERE id=? AND storeId=?`, [segs[1], storeId])
        if (!lead) return err('Lead not found', 404)
        return ok(lead)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['name','company','email','phone','source','status','priority','value','probability','expectedCloseDate','assignedTo','customerId','notes','tags'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Lead SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
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
        if (leadId) { q += ` AND leadId=?`; params.push(leadId) }
        q += ` ORDER BY createdAt DESC`
        return ok(await query(q, params))
      }
      if (!segs[1] && method === 'POST') {
        const b = await req.json() as any
        if (!b.leadId || !b.title) return err('leadId and title required')
        const id = newId(); const t = nowISO()
        await exec(
          `INSERT INTO LeadActivity (id,storeId,leadId,userId,type,title,note,dueDate,completedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, storeId, b.leadId, user.id, b.type ?? 'NOTE', b.title.trim(), b.note ?? null, b.dueDate ?? null, b.completedAt ?? null, t, t]
        )
        return ok({ id }, 201)
      }
      if (segs[1] && method === 'PATCH') {
        const b = await req.json() as any
        const allowed = new Set(['title','note','dueDate','completedAt'])
        const cols = filterCols(b, allowed)
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE LeadActivity SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [...values, nowISO(), segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ─── LOYALTY TIERS ────────────────────────────────────────────────────────
    if (segs[0] === 'loyalty-tiers') {
      if (!segs[1]) {
        if (method === 'GET') {
          return ok(await query(
            `SELECT * FROM LoyaltyTier WHERE storeId=? ORDER BY minPoints ASC`, [storeId]
          ))
        }
        if (method === 'POST') {
          const b = await req.json() as any
          if (!b.name || b.name.trim().length < 1) return err('name is required')
          const id = newId(); const t = nowISO()
          await exec(
            `INSERT INTO LoyaltyTier (id,storeId,name,minPoints,discount,color,icon,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
            [id, storeId, b.name.trim(), Number(b.minPoints ?? 0), Number(b.discount ?? 0), b.color ?? '#f59e0b', b.icon ?? '⭐', t]
          )
          return ok({ id }, 201)
        }
      }
      if (segs[1]) {
        const tid = segs[1]
        if (method === 'PATCH') {
          const b = await req.json() as any
          const allowed = new Set(['name', 'minPoints', 'discount', 'color', 'icon'])
          const cols = filterCols(b, allowed)
          if (Object.keys(cols).length === 0) return err('No valid fields')
          const { setClauses, values } = buildUpdate(cols)
          await exec(`UPDATE LoyaltyTier SET ${setClauses} WHERE id=? AND storeId=?`, [...values, tid, storeId])
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
      if (search) { sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`) }
      sql += ` ORDER BY points DESC LIMIT ? OFFSET ?`; p.push(limit, offset)
      return ok(await query(sql, p))
    }

    // ─── LOYALTY REDEMPTIONS ──────────────────────────────────────────────────
    if (segs[0] === 'loyalty-redemptions' && method === 'GET') {
      const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50')))
      const offset = Math.max(0, parseInt(sp.get('offset') ?? '0'))
      return ok(await query(
        `SELECT r.*, c.name as customerName FROM LoyaltyRedemption r
         LEFT JOIN Customer c ON r.customerId = c.id
         WHERE r.storeId=? ORDER BY r.createdAt DESC LIMIT ? OFFSET ?`,
        [storeId, limit, offset]
      ))
    }

    // ─── LOYALTY REDEEM ───────────────────────────────────────────────────────
    if (segs[0] === 'loyalty-redeem' && method === 'POST') {
      const b = await req.json() as any
      if (!b.customerId) return err('customerId is required')
      if (!b.pointsRedeemed || Number(b.pointsRedeemed) <= 0) return err('pointsRedeemed must be > 0')
      const customer = await queryOne<any>(`SELECT id, points FROM Customer WHERE id=? AND storeId=?`, [b.customerId, storeId])
      if (!customer) return err('Customer not found', 404)
      const pts = Number(b.pointsRedeemed)
      if (customer.points < pts) return err('Insufficient points', 400)
      const discountGiven = Number(b.discountGiven ?? 0)
      const id = newId(); const t = nowISO()
      await exec(
        `INSERT INTO LoyaltyRedemption (id,storeId,customerId,orderId,pointsRedeemed,discountGiven,createdAt) VALUES (?,?,?,?,?,?,?)`,
        [id, storeId, b.customerId, b.orderId ?? null, pts, discountGiven, t]
      )
      await exec(
        `UPDATE Customer SET points = MAX(0, points - ?), updatedAt=? WHERE id=? AND storeId=?`,
        [pts, t, b.customerId, storeId]
      )
      return ok({ id, pointsRedeemed: pts, discountGiven }, 201)
    }

    return err('Not found', 404)
  } catch (e: any) {
    console.error('API error:', e)
    return err('Internal server error', 500)
  }
}
