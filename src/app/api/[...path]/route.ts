import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

function ok(data: any, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function getDB() {
  const { env } = getRequestContext()
  return (env as any).DB as D1Database
}

async function q<T = any>(db: D1Database, sql: string, params: any[] = []): Promise<T[]> {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
  const r = await stmt.all<T>()
  return r.results ?? []
}
async function q1<T = any>(db: D1Database, sql: string, params: any[] = []): Promise<T | null> {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
  return (await stmt.first<T>()) ?? null
}
async function run(db: D1Database, sql: string, params: any[] = []) {
  const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
  return stmt.run()
}
function id() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`
}
function now() {
  return new Date().toISOString()
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handle(req, 'DELETE', path)
}

async function handle(req: NextRequest, method: string, segs: string[]) {
  const url = new URL(req.url)
  const sp = url.searchParams

  try {
    const db = await getDB()
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any
    const defaultStoreId = user.stores?.[0]?.id

    // ─── PRODUCTS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'products') {
      const storeId = sp.get('storeId') ?? defaultStoreId

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
          return ok(await q(db, sql, p))
        }
        if (method === 'POST') {
          const b = await req.json() as any
          const pid = id(); const t = now()
          await run(db,
            `INSERT INTO Product (id,storeId,name,price,description,sku,barcode,categoryId,cost,trackStock,stock,lowStock,active,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [pid, storeId, b.name, b.price, b.description||null, b.sku||null, b.barcode||null,
             b.categoryId||null, b.cost||0, b.trackStock?1:0, b.stock||0, b.lowStock||5, b.active!==false?1:0, t, t])
          if ((b.stock||0) > 0) {
            await run(db,
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [id(), pid, 'INITIAL', b.stock, 'Initial stock', t])
          }
          return ok({ id: pid, ...b }, 201)
        }
      }
      if (segs.length === 2) {
        const pid = segs[1]
        if (method === 'PATCH') {
          const b = await req.json() as any
          const t = now()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await run(db, `UPDATE Product SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...Object.values(b), t, pid, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await run(db, 'UPDATE Product SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?', [now(), pid, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'orders') {
      const storeId = sp.get('storeId') ?? defaultStoreId

      if (segs.length === 1) {
        if (method === 'GET') {
          const page = parseInt(sp.get('page') ?? '1')
          const limit = parseInt(sp.get('limit') ?? '20')
          const offset = (page - 1) * limit
          const status = sp.get('status')
          const dateFrom = sp.get('dateFrom')
          const dateTo = sp.get('dateTo')
          const search = sp.get('search')

          let sql = `SELECT o.*, u.name as userName, c.name as customerName
                     FROM "Order" o
                     LEFT JOIN User u ON o.userId = u.id
                     LEFT JOIN Customer c ON o.customerId = c.id
                     WHERE o.storeId = ?`
          const p: any[] = [storeId]
          if (status) { sql += ' AND o.status = ?'; p.push(status) }
          if (dateFrom) { sql += ' AND o.createdAt >= ?'; p.push(dateFrom) }
          if (dateTo) { sql += ' AND o.createdAt <= ?'; p.push(dateTo) }
          if (search) { sql += ' AND o.number LIKE ?'; p.push(`%${search}%`) }
          sql += ' ORDER BY o.createdAt DESC LIMIT ? OFFSET ?'
          p.push(limit, offset)

          const orders = await q(db, sql, p)
          // Fetch items + payments for each order
          const enriched = await Promise.all(orders.map(async (o: any) => {
            const items = await q(db, `SELECT * FROM OrderItem WHERE orderId = ?`, [o.id])
            const payments = await q(db, `SELECT * FROM Payment WHERE orderId = ?`, [o.id])
            return { ...o, items, payments }
          }))
          return ok(enriched)
        }

        if (method === 'POST') {
          const b = await req.json() as any
          const oid = id(); const t = now()
          const number = `INV-${Date.now()}`

          const stmts: Array<{sql: string, params: any[]}> = []

          // Insert order
          stmts.push({ sql:
            `INSERT INTO "Order" (id,storeId,number,status,userId,customerId,discountId,subtotal,discountAmt,taxAmt,total,note,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            params: [oid, storeId, number, 'PAID', b.userId||null, b.customerId||null,
                     b.discountId||null, b.subtotal, b.discountAmt||0, b.taxAmt||0, b.total, b.note||null, t, t]
          })

          // Insert items + deduct stock
          for (const item of (b.items || [])) {
            const iid = id()
            stmts.push({ sql:
              `INSERT INTO OrderItem (id,orderId,productId,variantId,name,variantName,price,qty,discount,subtotal)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [iid, oid, item.productId, item.variantId||null, item.name,
                       item.variantName||null, item.price, item.qty, item.discount||0, item.subtotal]
            })
            if (item.productId) {
              stmts.push({ sql: `UPDATE Product SET stock = stock - ? WHERE id = ?`, params: [item.qty, item.productId] })
              stmts.push({ sql:
                `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
                params: [id(), item.productId, 'SALE', -item.qty, `Order ${number}`, t]
              })
            }
          }

          // Insert payments
          for (const pay of (b.payments || [])) {
            stmts.push({ sql:
              `INSERT INTO Payment (id,orderId,method,amount,reference,change,createdAt)
               VALUES (?,?,?,?,?,?,?)`,
              params: [id(), oid, pay.method, pay.amount, pay.reference||null, pay.change||0, t]
            })
          }

          await db.batch(stmts.map(s => db.prepare(s.sql).bind(...s.params)))
          return ok({ id: oid, number, status: 'PAID' }, 201)
        }
      }

      // /orders/[id]/void
      if (segs.length === 3 && segs[2] === 'void' && method === 'POST') {
        const oid = segs[1]
        const order = await q1<any>(db, `SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [oid, storeId])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PAID') return err('Only PAID orders can be voided', 400)

        const items = await q<any>(db, `SELECT * FROM OrderItem WHERE orderId = ?`, [oid])
        const t = now()
        const stmts: Array<{sql: string, params: any[]}> = [
          { sql: `UPDATE "Order" SET status = 'VOIDED', updatedAt = ? WHERE id = ?`, params: [t, oid] }
        ]
        for (const item of items) {
          stmts.push({ sql: `UPDATE Product SET stock = stock + ? WHERE id = ?`, params: [item.qty, item.productId] })
          stmts.push({ sql:
            `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
            params: [id(), item.productId, 'VOID', item.qty, `Void order ${order.number}`, t]
          })
        }
        await db.batch(stmts.map(s => db.prepare(s.sql).bind(...s.params)))
        return ok({ success: true, status: 'VOIDED' })
      }
    }

    // ─── CUSTOMERS ────────────────────────────────────────────────────────────
    if (segs[0] === 'customers') {
      const storeId = sp.get('storeId') ?? defaultStoreId

      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('q') ?? ''
          const page = parseInt(sp.get('page') ?? '1')
          const limit = parseInt(sp.get('limit') ?? '20')
          const offset = (page - 1) * limit
          let sql = `SELECT * FROM Customer WHERE storeId = ?`
          const p: any[] = [storeId]
          if (search) {
            sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`
            p.push(`%${search}%`, `%${search}%`, `%${search}%`)
          }
          sql += ' ORDER BY name LIMIT ? OFFSET ?'
          p.push(limit, offset)
          return ok(await q(db, sql, p))
        }
        if (method === 'POST') {
          const b = await req.json() as any
          const cid = id(); const t = now()
          await run(db,
            `INSERT INTO Customer (id,storeId,name,phone,email,address,points,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [cid, storeId, b.name, b.phone||null, b.email||null, b.address||null, 0, t, t])
          return ok({ id: cid, ...b }, 201)
        }
      }
      if (segs.length === 2) {
        const cid = segs[1]
        if (method === 'GET') {
          const customer = await q1(db, `SELECT * FROM Customer WHERE id = ? AND storeId = ?`, [cid, storeId])
          if (!customer) return err('Customer not found', 404)
          const orders = await q(db,
            `SELECT o.*, u.name as userName FROM "Order" o LEFT JOIN User u ON o.userId = u.id
             WHERE o.customerId = ? ORDER BY o.createdAt DESC LIMIT 10`, [cid])
          return ok({ ...customer, orders })
        }
        if (method === 'PATCH') {
          const b = await req.json() as any
          const t = now()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await run(db, `UPDATE Customer SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...Object.values(b), t, cid, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          const cnt = await q1<any>(db, `SELECT COUNT(*) as c FROM "Order" WHERE customerId = ?`, [cid])
          if ((cnt?.c ?? 0) > 0) return err('Cannot delete customer with orders', 400)
          await run(db, `DELETE FROM Customer WHERE id = ? AND storeId = ?`, [cid, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── INVENTORY ────────────────────────────────────────────────────────────
    if (segs[0] === 'inventory') {
      const storeId = sp.get('storeId') ?? defaultStoreId

      if (segs.length === 1 && method === 'GET') {
        const lowStockOnly = sp.get('lowStockOnly') === 'true'
        let sql = `SELECT p.*, c.name as categoryName FROM Product p
                   LEFT JOIN Category c ON p.categoryId = c.id
                   WHERE p.storeId = ? AND p.trackStock = 1`
        if (lowStockOnly) sql += ' AND p.stock <= p.lowStock'
        sql += ' ORDER BY p.stock ASC'
        return ok(await q(db, sql, [storeId]))
      }

      // /inventory/[productId]/adjust
      if (segs.length === 3 && segs[2] === 'adjust' && method === 'POST') {
        const b = await req.json() as any
        const { qty, type, note } = b
        const pid = segs[1]; const t = now()
        await run(db, `UPDATE Product SET stock = stock + ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
          [qty, t, pid, storeId])
        await run(db,
          `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
          [id(), pid, type, qty, note||null, t])
        const product = await q1(db, `SELECT * FROM Product WHERE id = ?`, [pid])
        return ok(product)
      }

      // /inventory/[productId]/logs
      if (segs.length === 3 && segs[2] === 'logs' && method === 'GET') {
        const logs = await q(db,
          `SELECT * FROM StockLog WHERE productId = ? ORDER BY createdAt DESC LIMIT 50`, [segs[1]])
        return ok(logs)
      }
    }

    // ─── DISCOUNTS ────────────────────────────────────────────────────────────
    if (segs[0] === 'discounts') {
      const storeId = sp.get('storeId') ?? defaultStoreId

      if (segs.length === 1) {
        if (method === 'GET') return ok(await q(db,
          `SELECT * FROM Discount WHERE storeId = ? ORDER BY createdAt DESC`, [storeId]))
        if (method === 'POST') {
          const b = await req.json() as any; const did = id(); const t = now()
          await run(db,
            `INSERT INTO Discount (id,storeId,name,code,type,value,minOrder,maxUses,usedCount,startsAt,endsAt,active,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [did, storeId, b.name, b.code||null, b.type, b.value, b.minOrder||0,
             b.maxUses||null, 0, b.startsAt||null, b.endsAt||null, 1, t, t])
          return ok({ id: did, ...b }, 201)
        }
      }
      if (segs.length === 2) {
        const did = segs[1]
        if (method === 'PATCH') {
          const b = await req.json() as any; const t = now()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await run(db, `UPDATE Discount SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...Object.values(b), t, did, storeId])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await run(db, `UPDATE Discount SET active = 0, updatedAt = ? WHERE id = ? AND storeId = ?`, [now(), did, storeId])
          return ok({ success: true })
        }
      }
    }

    // ─── STAFF ────────────────────────────────────────────────────────────────
    if (segs[0] === 'staff') {
      const storeId = sp.get('storeId') ?? defaultStoreId

      if (segs.length === 1) {
        if (method === 'GET') return ok(await q(db,
          `SELECT u.*, su.role as storeRole FROM User u
           JOIN StoreUser su ON u.id = su.userId WHERE su.storeId = ? ORDER BY u.name`, [storeId]))
        if (method === 'POST') {
          const b = await req.json() as any; const uid = id(); const t = now()
          const bcrypt = await import('bcryptjs')
          const hashedPwd = b.password ? await bcrypt.hash(b.password, 10) : null
          const hashedPin = b.pin ? await bcrypt.hash(b.pin, 10) : null
          await db.batch([
            db.prepare(`INSERT INTO User (id,tenantId,name,email,password,pin,role,active,isSuperAdmin,createdAt,updatedAt)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
              .bind(uid, user.tenantId||null, b.name, b.email, hashedPwd, hashedPin, b.role||'CASHIER', 1, 0, t, t),
            db.prepare(`INSERT INTO StoreUser (id,storeId,userId,role) VALUES (?,?,?,?)`)
              .bind(id(), storeId, uid, b.role||'CASHIER')
          ])
          return ok({ id: uid, ...b, password: undefined, pin: undefined }, 201)
        }
      }
      if (segs.length === 2) {
        const uid = segs[1]
        if (method === 'PATCH') {
          const b = await req.json() as any; const t = now()
          if (b.password) { const bcrypt = await import('bcryptjs'); b.password = await bcrypt.hash(b.password, 10) }
          if (b.pin) { const bcrypt = await import('bcryptjs'); b.pin = await bcrypt.hash(b.pin, 10) }
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await run(db, `UPDATE User SET ${cols}, updatedAt = ? WHERE id = ?`,
            [...Object.values(b), t, uid])
          return ok({ success: true })
        }
        if (method === 'DELETE') {
          await run(db, `UPDATE User SET active = 0, updatedAt = ? WHERE id = ?`, [now(), uid])
          return ok({ success: true })
        }
      }
    }

    // ─── SETTINGS ─────────────────────────────────────────────────────────────
    if (segs[0] === 'settings' && segs[1] === 'store') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (method === 'GET') return ok(await q1(db, `SELECT * FROM Store WHERE id = ?`, [storeId]))
      if (method === 'PATCH') {
        const b = await req.json() as any; const t = now()
        const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
        await run(db, `UPDATE Store SET ${cols}, updatedAt = ? WHERE id = ?`,
          [...Object.values(b), t, storeId])
        return ok({ success: true })
      }
    }

    // ─── REPORTS ──────────────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'summary' && method === 'GET') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()

      const [revenue, daily, topProducts, payments, customers] = await Promise.all([
        q1<any>(db,
          `SELECT SUM(total) as totalRevenue, COUNT(*) as totalOrders, AVG(total) as avgOrderValue
           FROM "Order" WHERE storeId = ? AND status = 'PAID' AND createdAt BETWEEN ? AND ?`,
          [storeId, from, to]),
        q(db,
          `SELECT DATE(createdAt) as date, SUM(total) as total, COUNT(*) as orders
           FROM "Order" WHERE storeId = ? AND status = 'PAID' AND createdAt BETWEEN ? AND ?
           GROUP BY DATE(createdAt) ORDER BY date`,
          [storeId, from, to]),
        q(db,
          `SELECT oi.name, SUM(oi.subtotal) as revenue, SUM(oi.qty) as qty
           FROM OrderItem oi JOIN "Order" o ON oi.orderId = o.id
           WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt BETWEEN ? AND ?
           GROUP BY oi.name ORDER BY revenue DESC LIMIT 5`,
          [storeId, from, to]),
        q(db,
          `SELECT p.method, SUM(p.amount) as total, COUNT(*) as count
           FROM Payment p JOIN "Order" o ON p.orderId = o.id
           WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt BETWEEN ? AND ?
           GROUP BY p.method`,
          [storeId, from, to]),
        q1<any>(db,
          `SELECT COUNT(*) as newCustomers FROM Customer WHERE storeId = ? AND createdAt BETWEEN ? AND ?`,
          [storeId, from, to]),
      ])

      return ok({
        totalRevenue: revenue?.totalRevenue ?? 0,
        totalOrders: revenue?.totalOrders ?? 0,
        avgOrderValue: revenue?.avgOrderValue ?? 0,
        newCustomers: customers?.newCustomers ?? 0,
        dailySales: daily,
        topProducts,
        paymentBreakdown: payments,
      })
    }

    return err('Not found', 404)
  } catch (e: any) {
    console.error('API error:', e)
    return err(e.message || 'Internal server error', 500)
  }
}
