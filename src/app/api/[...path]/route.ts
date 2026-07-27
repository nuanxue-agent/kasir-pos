import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, batchExec, newId, nowISO } from '@/lib/db'

function ok(data: any, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

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
          const pid = newId(); const t = nowISO()
          await exec(
            `INSERT INTO Product (id,storeId,name,price,description,sku,barcode,categoryId,cost,trackStock,stock,lowStock,active,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [pid, storeId, b.name, b.price, b.description||null, b.sku||null, b.barcode||null,
             b.categoryId||null, b.cost||0, b.trackStock?1:0, b.stock||0, b.lowStock||5, b.active!==false?1:0, t, t])
          if ((b.stock||0) > 0)
            await exec(`INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [newId(), pid, 'INITIAL', b.stock, 'Initial stock', t])
          return ok({ id: pid, ...b }, 201)
        }
      }
      if (segs.length === 2) {
        const pid = segs[1]
        if (method === 'PATCH') {
          const b: any = await req.json(); const t = nowISO()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await exec(`UPDATE Product SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`,
            [...Object.values(b), t, pid, storeId])
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
      if (method === 'GET') return ok(await query(
        `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`, [storeId]))
    }

    // ─── ORDERS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'orders') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (segs.length === 1) {
        if (method === 'GET') {
          const page = parseInt(sp.get('page') ?? '1')
          const limit = parseInt(sp.get('limit') ?? '20')
          const offset = (page - 1) * limit
          const status = sp.get('status'); const dateFrom = sp.get('dateFrom'); const dateTo = sp.get('dateTo')
          let sql = `SELECT o.*, u.name as userName, c.name as customerName
                     FROM "Order" o LEFT JOIN User u ON o.userId = u.id
                     LEFT JOIN Customer c ON o.customerId = c.id WHERE o.storeId = ?`
          const p: any[] = [storeId]
          if (status) { sql += ' AND o.status = ?'; p.push(status) }
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
          const b: any = await req.json(); const oid = newId(); const t = nowISO()
          const number = `INV-${Date.now()}`
          const stmts: Array<{ sql: string; params: any[] }> = [
            { sql: `INSERT INTO "Order" (id,storeId,number,status,userId,customerId,discountId,subtotal,discountAmt,taxAmt,total,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              params: [oid, storeId, number, 'PAID', b.userId||null, b.customerId||null, b.discountId||null, b.subtotal, b.discountAmt||0, b.taxAmt||0, b.total, b.note||null, t, t] }
          ]
          for (const item of (b.items || [])) {
            stmts.push({ sql: `INSERT INTO OrderItem (id,orderId,productId,variantId,name,variantName,price,qty,discount,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [newId(), oid, item.productId, item.variantId||null, item.name, item.variantName||null, item.price, item.qty, item.discount||0, item.subtotal] })
            if (item.productId) {
              stmts.push({ sql: `UPDATE Product SET stock = stock - ? WHERE id = ?`, params: [item.qty, item.productId] })
              stmts.push({ sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
                params: [newId(), item.productId, 'SALE', -item.qty, `Order ${number}`, t] })
            }
          }
          for (const pay of (b.payments || []))
            stmts.push({ sql: `INSERT INTO Payment (id,orderId,method,amount,reference,change,createdAt) VALUES (?,?,?,?,?,?,?)`,
              params: [newId(), oid, pay.method, pay.amount, pay.reference||null, pay.change||0, t] })
          await batchExec(stmts)
          return ok({ id: oid, number, status: 'PAID' }, 201)
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
      if (segs.length === 1) {
        if (method === 'GET') {
          const search = sp.get('q') ?? ''
          const page = parseInt(sp.get('page') ?? '1'); const limit = parseInt(sp.get('limit') ?? '20')
          let sql = `SELECT * FROM Customer WHERE storeId = ?`
          const p: any[] = [storeId]
          if (search) { sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`) }
          sql += ' ORDER BY name LIMIT ? OFFSET ?'; p.push(limit, (page - 1) * limit)
          return ok(await query(sql, p))
        }
        if (method === 'POST') {
          const b: any = await req.json(); const cid = newId(); const t = nowISO()
          await exec(`INSERT INTO Customer (id,storeId,name,phone,email,address,points,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`,
            [cid, storeId, b.name, b.phone||null, b.email||null, b.address||null, 0, t, t])
          return ok({ id: cid, ...b }, 201)
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
          const b: any = await req.json(); const t = nowISO()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await exec(`UPDATE Customer SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`, [...Object.values(b), t, cid, storeId])
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
      if (segs.length === 1 && method === 'GET') {
        const lowStockOnly = sp.get('lowStockOnly') === 'true'
        let sql = `SELECT p.*, c.name as categoryName FROM Product p LEFT JOIN Category c ON p.categoryId = c.id WHERE p.storeId = ? AND p.trackStock = 1`
        if (lowStockOnly) sql += ' AND p.stock <= p.lowStock'
        return ok(await query(sql + ' ORDER BY p.stock ASC', [storeId]))
      }
      if (segs.length === 3 && segs[2] === 'adjust' && method === 'POST') {
        const b: any = await req.json(); const pid = segs[1]; const t = nowISO()
        await exec(`UPDATE Product SET stock = stock + ?, updatedAt = ? WHERE id = ? AND storeId = ?`, [b.qty, t, pid, storeId])
        await exec(`INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`, [newId(), pid, b.type, b.qty, b.note||null, t])
        return ok(await queryOne(`SELECT * FROM Product WHERE id = ?`, [pid]))
      }
      if (segs.length === 3 && segs[2] === 'logs' && method === 'GET')
        return ok(await query(`SELECT * FROM StockLog WHERE productId = ? ORDER BY createdAt DESC LIMIT 50`, [segs[1]]))
    }

    // ─── DISCOUNTS ────────────────────────────────────────────────────────────
    if (segs[0] === 'discounts') {
      const storeId = sp.get('storeId') ?? defaultStoreId
      if (segs.length === 1) {
        if (method === 'GET') return ok(await query(`SELECT * FROM Discount WHERE storeId = ? ORDER BY createdAt DESC`, [storeId]))
        if (method === 'POST') {
          const b: any = await req.json(); const did = newId(); const t = nowISO()
          await exec(`INSERT INTO Discount (id,storeId,name,code,type,value,minOrder,maxUses,usedCount,startsAt,endsAt,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [did, storeId, b.name, b.code||null, b.type, b.value, b.minOrder||0, b.maxUses||null, 0, b.startsAt||null, b.endsAt||null, 1, t, t])
          return ok({ id: did, ...b }, 201)
        }
      }
      if (segs.length === 2) {
        const did = segs[1]
        if (method === 'PATCH') {
          const b: any = await req.json(); const t = nowISO()
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await exec(`UPDATE Discount SET ${cols}, updatedAt = ? WHERE id = ? AND storeId = ?`, [...Object.values(b), t, did, storeId])
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
      if (segs.length === 1) {
        if (method === 'GET') return ok(await query(
          `SELECT u.id, u.name, u.email, u.role, u.active, su.role as storeRole FROM User u
           JOIN StoreUser su ON u.id = su.userId WHERE su.storeId = ? ORDER BY u.name`, [storeId]))
        if (method === 'POST') {
          const b: any = await req.json(); const uid = newId(); const t = nowISO()
          const bcrypt = await import('bcryptjs')
          const pwd = b.password ? await bcrypt.hash(b.password, 10) : null
          await batchExec([
            { sql: `INSERT INTO User (id,tenantId,name,email,password,role,active,isSuperAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              params: [uid, user.tenantId||null, b.name, b.email, pwd, b.role||'CASHIER', 1, 0, t, t] },
            { sql: `INSERT INTO StoreUser (id,storeId,userId,role) VALUES (?,?,?,?)`,
              params: [newId(), storeId, uid, b.role||'CASHIER'] }
          ])
          return ok({ id: uid, name: b.name, email: b.email, role: b.role }, 201)
        }
      }
      if (segs.length === 2) {
        const uid = segs[1]
        if (method === 'PATCH') {
          const b: any = await req.json(); const t = nowISO()
          if (b.password) { const bcrypt = await import('bcryptjs'); b.password = await bcrypt.hash(b.password, 10) }
          const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
          await exec(`UPDATE User SET ${cols}, updatedAt = ? WHERE id = ?`, [...Object.values(b), t, uid])
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
      if (method === 'GET') return ok(await queryOne(`SELECT * FROM Store WHERE id = ?`, [storeId]))
      if (method === 'PATCH') {
        const b: any = await req.json(); const t = nowISO()
        const cols = Object.keys(b).map(k => `${k} = ?`).join(', ')
        await exec(`UPDATE Store SET ${cols}, updatedAt = ? WHERE id = ?`, [...Object.values(b), t, storeId])
        return ok({ success: true })
      }
    }

    // ─── REPORTS ──────────────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'summary' && method === 'GET') {
      const storeId = sp.get('storeId') ?? defaultStoreId
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
    return err(e.message || 'Internal server error', 500)
  }
}
