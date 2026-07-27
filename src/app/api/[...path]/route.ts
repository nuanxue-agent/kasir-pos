import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, batchExec, newId, nowISO } from '@/lib/db'
import { postJournalEntry } from '@/lib/accounting'
import { logAudit, getAuditLogs } from '@/lib/audit'
import {
  generateGiftCardCode,
  deductGiftCardBalance,
  resolveGiftCardStatus,
} from '@/lib/gift-cards'
import { checkProductLimit, checkStoreLimit, type Plan } from '@/lib/plan'

// ─── Validation helpers ────────────────────────────────────────────────────────

export class ValidationError extends Error {
  code: string
  status: number
  constructor(message: string, code = 'VALIDATION_ERROR', status = 400) {
    super(message)
    this.name = 'ValidationError'
    this.code = code
    this.status = status
  }
}

export function validateRequired(obj: Record<string, any>, fields: string[]): void {
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      throw new ValidationError(`Field '${field}' is required`, 'MISSING_FIELD')
    }
  }
}

export function validatePositive(value: any, name: string): void {
  const num = Number(value)
  if (isNaN(num) || num <= 0) {
    throw new ValidationError(`'${name}' must be a positive number`, 'INVALID_VALUE')
  }
}

export function validateDate(value: any, name: string): void {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`'${name}' must be a valid ISO date string`, 'INVALID_DATE')
  }
  const d = new Date(value)
  if (isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(value)) {
    throw new ValidationError(`'${name}' must be a valid ISO date string`, 'INVALID_DATE')
  }
}

// ─── Response helpers ──────────────────────────────────────────────────────────

function makeHeaders(requestId: string, startMs: number): Record<string, string> {
  return {
    'X-Request-ID': requestId,
    'X-Response-Time': `${Date.now() - startMs}ms`,
  }
}

function ok(data: any, status = 200, requestId?: string, startMs?: number) {
  const headers = requestId && startMs !== undefined ? makeHeaders(requestId, startMs) : undefined
  return NextResponse.json(data, { status, headers })
}
function err(msg: string, status = 400, code = 'ERROR', requestId?: string, startMs?: number) {
  const headers = requestId && startMs !== undefined ? makeHeaders(requestId, startMs) : {}
  return NextResponse.json({ error: msg, code, requestId: requestId ?? null }, { status, headers })
}
function okCached(
  data: any,
  cacheControl: string,
  status = 200,
  requestId?: string,
  startMs?: number,
) {
  const headers: Record<string, string> = { 'Cache-Control': cacheControl }
  if (requestId && startMs !== undefined) {
    Object.assign(headers, makeHeaders(requestId, startMs))
  }
  return NextResponse.json(data, { status, headers })
}

// ─── In-memory rate limiter ────────────────────────────────────────────────────
// Max 100 requests per minute per IP. Resets on window expiry.

const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW_MS = 60_000

interface RateEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateEntry>()

function checkRateLimit(req: NextRequest): NextResponse | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now >= entry.resetAt) {
    // New window
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return null
  }

  entry.count += 1

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too Many Requests', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    )
  }

  return null
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
  const requestId = crypto.randomUUID()
  const startMs = Date.now()
  const url = new URL(req.url)
  const sp = url.searchParams

  // Apply rate limiting
  const rateLimitResponse = checkRateLimit(req)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED', requestId, startMs)
    const user = session.user as any
    const defaultStoreId = user.stores?.[0]?.id

    // ─── GLOBAL TENANT GUARD ──────────────────────────────────────────────────
    // Resolve storeId once for all routes. Public endpoints (register/login)
    // are handled in separate route files and never reach here.
    const storeId: string = url.searchParams.get('storeId') ?? defaultStoreId
    if (!storeId) return err('storeId required', 400, 'MISSING_FIELD', requestId, startMs)

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
          return okCached(await query(sql, p), 'public, max-age=30, stale-while-revalidate=60')
        }
        if (method === 'POST') {
          const b: any = await req.json()
          validateRequired(b, ['name', 'price'])
          validatePositive(b.price, 'price')

          // ── Plan limit: check product count for FREE plan ──────────────────
          const storePlan = (user.stores?.find((s: any) => s.id === storeId)?.plan ??
            'FREE') as Plan
          const [countRow] = (await query(
            `SELECT COUNT(*) as cnt FROM Product WHERE storeId = ? AND active = 1`,
            [storeId],
          )) as any[]
          const currentCount = Number(countRow?.cnt ?? 0)
          if (!checkProductLimit(storePlan, currentCount)) {
            return NextResponse.json(
              { error: 'Plan limit reached', upgrade: true },
              { status: 403 },
            )
          }

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

    // ─── PRODUCTS/TEMPLATE ───────────────────────────────────────────────────
    if (segs[0] === 'products' && segs[1] === 'template' && method === 'GET') {
      const csvContent =
        'name,sku,price,cost,stock,categoryName\n' +
        'Kopi Arabica,SKU-001,25000,15000,100,Minuman\n' +
        'Teh Hijau,SKU-002,18000,10000,50,Minuman\n'
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="product_import_template.csv"',
        },
      })
    }

    // ─── PRODUCTS/IMPORT ─────────────────────────────────────────────────────
    if (segs[0] === 'products' && segs[1] === 'import' && method === 'POST') {
      const body: any = await req.json()
      const rows: Array<{
        name: string
        price: number | null
        cost: number | null
        sku: string
        categoryName: string
        stock: number | null
      }> = Array.isArray(body.rows) ? body.rows : []

      if (rows.length === 0) return err('No rows provided', 400)
      if (rows.length > 1000) return err('Maximum 1000 rows per import', 400)

      let created = 0
      let updated = 0
      const errors: Array<{ row: number; message: string }> = []
      const t = nowISO()

      // Pre-fetch all categories for this store so we can resolve by name
      const existingCategories = (await query(`SELECT id, name FROM Category WHERE storeId = ?`, [
        storeId,
      ])) as Array<{ id: string; name: string }>
      const categoryByName = new Map<string, string>(
        existingCategories.map(c => [c.name.toLowerCase(), c.id]),
      )

      // Pre-fetch existing product SKUs
      const existingProducts = (await query(
        `SELECT id, sku FROM Product WHERE storeId = ? AND sku IS NOT NULL`,
        [storeId],
      )) as Array<{ id: string; sku: string }>
      const skuToId = new Map<string, string>(existingProducts.map(p => [p.sku, p.id]))

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        try {
          if (!row.name) {
            errors.push({ row: i + 1, message: 'Missing name' })
            continue
          }
          if (row.price === null || row.price === undefined || row.price < 0) {
            errors.push({ row: i + 1, message: 'Invalid price' })
            continue
          }

          // Resolve categoryId from name (case-insensitive)
          let categoryId: string | null = null
          if (row.categoryName) {
            categoryId = categoryByName.get(row.categoryName.toLowerCase()) ?? null
          }

          const price = Number(row.price)
          const cost = Number(row.cost) || 0
          const stock = Number(row.stock) || 0

          if (row.sku && skuToId.has(row.sku)) {
            // Update existing product
            const pid = skuToId.get(row.sku)!
            await exec(
              `UPDATE Product SET name=?, price=?, cost=?, categoryId=?, stock=?, updatedAt=?
               WHERE id=? AND storeId=?`,
              [row.name, price, cost, categoryId, stock, t, pid, storeId],
            )
            updated++
          } else {
            // Create new product
            const pid = newId()
            await exec(
              `INSERT INTO Product (id,storeId,name,price,cost,sku,categoryId,trackStock,stock,lowStock,active,createdAt,updatedAt)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                pid,
                storeId,
                row.name,
                price,
                cost,
                row.sku || null,
                categoryId,
                1,
                stock,
                5,
                1,
                t,
                t,
              ],
            )
            if (stock > 0) {
              await exec(
                `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
                [newId(), pid, 'INITIAL', stock, 'Imported', t],
              )
            }
            created++
          }
        } catch (e: any) {
          errors.push({ row: i + 1, message: e?.message ?? 'Unknown error' })
        }
      }

      return ok({ created, updated, errors: errors.length, errorDetails: errors })
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
        return okCached(
          await query(
            `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`,
            [storeId],
          ),
          'public, max-age=300',
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
          validateRequired(b, ['items', 'payments'])
          if (!b.items?.length)
            throw new ValidationError('Order must have at least one item', 'MISSING_ITEMS')
          if (!b.payments?.length)
            throw new ValidationError('Order must have at least one payment', 'MISSING_PAYMENTS')
          const oid = newId()
          const t = nowISO()
          const number = `INV-${Date.now()}`
          const stmts: Array<{ sql: string; params: any[] }> = [
            {
              sql: `INSERT INTO "Order" (id,storeId,number,status,userId,customerId,discountId,subtotal,discountAmt,taxAmt,total,note,tableId,tableNumber,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
                b.tableId || null,
                b.tableNumber ? Number(b.tableNumber) : null,
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

      // ── POST /api/orders/:id/refund — partial or full refund, restores stock ──
      if (segs.length === 3 && segs[2] === 'refund' && method === 'POST') {
        const oid = segs[1]
        // Only OWNER and MANAGER may refund
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)

        const order = await queryOne(`SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [
          oid,
          storeId,
        ])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PAID') return err('Only PAID orders can be refunded', 400)

        const allItems = await query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid])

        // Parse optional partial-refund body
        let body: { items?: { id: string; qty: number }[] } = {}
        try {
          const text = await req.text()
          if (text.trim()) body = JSON.parse(text)
        } catch {
          // empty body = full refund
        }

        const t = nowISO()
        const stmts: Array<{ sql: string; params: any[] }> = [
          {
            sql: `UPDATE "Order" SET status = 'REFUNDED', updatedAt = ? WHERE id = ?`,
            params: [t, oid],
          },
        ]

        // Build qty-to-refund map: partial overrides, default = full qty
        const refundQtyMap: Record<string, number> = {}
        for (const item of allItems) {
          refundQtyMap[item.id] = item.qty // default: full
        }
        if (body.items?.length) {
          for (const ri of body.items) {
            const original = allItems.find((i: any) => i.id === ri.id)
            if (!original) continue
            const qty = Math.max(0, Math.min(Number(ri.qty), original.qty))
            refundQtyMap[ri.id] = qty
          }
        }

        for (const item of allItems) {
          const refundQty = refundQtyMap[item.id] ?? item.qty
          if (refundQty <= 0) continue
          if (item.productId) {
            stmts.push({
              sql: `UPDATE Product SET stock = stock + ? WHERE id = ? AND storeId = ?`,
              params: [refundQty, item.productId, storeId],
            })
            stmts.push({
              sql: `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              params: [newId(), item.productId, 'REFUND', refundQty, `Refund ${order.number}`, t],
            })
          }
        }

        await batchExec(stmts)

        logAudit({
          storeId,
          userId: user.id,
          action: 'ORDER_REFUND',
          resourceType: 'Order',
          resourceId: oid,
          meta: { number: order.number, partial: !!body.items?.length },
        }).catch(() => {})

        // Return updated order with items + payments
        const [updatedOrder, items, payments] = await Promise.all([
          queryOne(
            `SELECT o.*, u.name as userName, c.name as customerName
             FROM "Order" o
             LEFT JOIN User u ON o.userId = u.id
             LEFT JOIN Customer c ON o.customerId = c.id
             WHERE o.id = ? AND o.storeId = ?`,
            [oid, storeId],
          ),
          query(`SELECT * FROM OrderItem WHERE orderId = ?`, [oid]),
          query(`SELECT * FROM Payment WHERE orderId = ?`, [oid]),
        ])
        return ok({ ...updatedOrder, items, payments })
      }

      // ── PATCH /api/orders/:id/void — PATCH alias for void ────────────────────
      if (segs.length === 3 && segs[2] === 'void' && method === 'PATCH') {
        const oid = segs[1]
        const order = await queryOne(`SELECT * FROM "Order" WHERE id = ? AND storeId = ?`, [
          oid,
          storeId,
        ])
        if (!order) return err('Order not found', 404)
        if (order.status !== 'PENDING')
          return err('Only PENDING orders can be voided via PATCH', 400)
        const t = nowISO()
        await batchExec([
          {
            sql: `UPDATE "Order" SET status = 'VOIDED', updatedAt = ? WHERE id = ?`,
            params: [t, oid],
          },
        ])
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
          validateRequired(b, ['name'])
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

      // ── GET /api/customers/:id/points-expiry ───────────────────────────────
      if (segs.length === 3 && segs[2] === 'points-expiry' && method === 'GET') {
        const cid = segs[1]
        const customer = await queryOne<any>(
          `SELECT id, name, points FROM Customer WHERE id = ? AND storeId = ?`,
          [cid, storeId],
        )
        if (!customer) return err('Customer not found', 404)

        // Find the most recent order or points activity for this customer
        let lastActivity: string | null = null
        try {
          const lastOrder = await queryOne<any>(
            `SELECT createdAt FROM "Order" WHERE customerId = ? AND storeId = ? AND status = 'PAID' ORDER BY createdAt DESC LIMIT 1`,
            [cid, storeId],
          )
          const lastRedemption = await queryOne<any>(
            `SELECT createdAt FROM LoyaltyRedemption WHERE customerId = ? ORDER BY createdAt DESC LIMIT 1`,
            [cid],
          ).catch(() => null)

          const dates = [lastOrder?.createdAt, lastRedemption?.createdAt].filter(Boolean)
          lastActivity = dates.sort().reverse()[0] ?? null
        } catch {
          lastActivity = null
        }

        // Points expire 12 months after last activity
        const EXPIRY_MONTHS = 12
        const now = new Date()
        let expiresAt: string | null = null
        let daysUntilExpiry: number | null = null
        let isExpired = false

        if (lastActivity) {
          const activityDate = new Date(lastActivity)
          const exp = new Date(activityDate)
          exp.setMonth(exp.getMonth() + EXPIRY_MONTHS)
          expiresAt = exp.toISOString()
          daysUntilExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          isExpired = daysUntilExpiry <= 0
        }

        return ok({
          customerId: cid,
          points: Number(customer.points),
          lastActivity,
          expiresAt,
          daysUntilExpiry,
          isExpired,
          expiryMonths: EXPIRY_MONTHS,
        })
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
      return okCached(
        {
          totalRevenue,
          totalOrders: (revenue as any)?.totalOrders ?? 0,
          avgOrderValue: (revenue as any)?.avgOrderValue ?? 0,
          newCustomers: (customers as any)?.newCustomers ?? 0,
          totalExpenses,
          netProfit: totalRevenue - totalExpenses,
          dailySales: daily,
          topProducts,
          paymentBreakdown: payments,
        },
        'private, max-age=10',
      )
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

    // ─── REPORTS / PNL (monthly columns, year + optional compareYear) ─────────
    if (segs[0] === 'reports' && segs[1] === 'pnl' && method === 'GET') {
      const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()), 10)
      const compareYear = sp.get('compareYear') ? parseInt(sp.get('compareYear')!, 10) : null

      async function fetchPnLForYear(y: number) {
        const yearFrom = `${y}-01-01T00:00:00.000Z`
        const yearTo = `${y}-12-31T23:59:59.999Z`

        // Monthly revenue from POS orders
        const revenueRows = await query<any>(
          `SELECT strftime('%m', datetime(createdAt)) as month,
                  COALESCE(SUM(total),0) as revenue
           FROM "Order"
           WHERE storeId=? AND status='PAID'
             AND createdAt BETWEEN ? AND ?
           GROUP BY month`,
          [storeId, yearFrom, yearTo],
        )

        // Monthly COGS (qty * cost per item)
        const cogsRows = await query<any>(
          `SELECT strftime('%m', datetime(o.createdAt)) as month,
                  COALESCE(SUM(oi.qty * COALESCE(p.cost, 0)), 0) as cogs
           FROM OrderItem oi
           JOIN "Order" o ON oi.orderId = o.id
           LEFT JOIN Product p ON oi.productId = p.id
           WHERE o.storeId=? AND o.status='PAID'
             AND o.createdAt BETWEEN ? AND ?
           GROUP BY month`,
          [storeId, yearFrom, yearTo],
        )

        // Monthly operating expenses
        const opexRows = await query<any>(
          `SELECT strftime('%m', date) as month,
                  COALESCE(SUM(amount),0) as opex
           FROM Expense
           WHERE storeId=? AND date BETWEEN ? AND ?
           GROUP BY month`,
          [storeId, `${y}-01-01`, `${y}-12-31`],
        )

        // Build month maps (1-12)
        const revenueMap: Record<number, number> = {}
        const cogsMap: Record<number, number> = {}
        const opexMap: Record<number, number> = {}
        for (const r of revenueRows) revenueMap[parseInt(r.month, 10)] = Number(r.revenue)
        for (const r of cogsRows) cogsMap[parseInt(r.month, 10)] = Number(r.cogs)
        for (const r of opexRows) opexMap[parseInt(r.month, 10)] = Number(r.opex)

        // Monthly depreciation from active assets
        // Lazy-ensure Asset table exists (may not exist on first P&L load)
        try {
          await exec(`CREATE TABLE IF NOT EXISTS Asset (
            id TEXT PRIMARY KEY,
            storeId TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Peralatan',
            purchaseDate TEXT NOT NULL,
            purchasePrice REAL NOT NULL DEFAULT 0,
            usefulLife INTEGER NOT NULL DEFAULT 5,
            method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
            salvageValue REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          )`)
        } catch {}

        const assetRows = await query<any>(
          `SELECT purchasePrice, salvageValue, usefulLife, method FROM Asset WHERE storeId = ? AND status = 'ACTIVE'`,
          [storeId],
        )

        // Calculate per-asset monthly depreciation (flat across all months)
        function calcMonthlyDep(a: any): number {
          const pp = Number(a.purchasePrice)
          const sv = Number(a.salvageValue)
          const ul = Number(a.usefulLife)
          if (ul <= 0) return 0
          if (a.method === 'STRAIGHT_LINE') {
            return (pp - sv) / (ul * 12)
          }
          // Declining balance: approximate as total dep / total months
          const rate = 2 / ul
          let bv = pp
          let totalDep = 0
          for (let yr = 0; yr < ul; yr++) {
            const dep = yr < ul - 1 ? bv * rate : Math.max(0, bv - sv)
            totalDep += Math.max(0, bv - Math.max(sv, bv - dep))
            bv = Math.max(sv, bv - bv * rate)
          }
          return totalDep / (ul * 12)
        }

        const totalMonthlyDep = assetRows.reduce((s: number, a: any) => s + calcMonthlyDep(a), 0)

        const months = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1
          const revenue = revenueMap[m] ?? 0
          const cogs = cogsMap[m] ?? 0
          const grossProfit = revenue - cogs
          const operatingExpenses = (opexMap[m] ?? 0) + totalMonthlyDep
          const depreciation = totalMonthlyDep
          const netProfit = grossProfit - operatingExpenses
          return { month: m, revenue, cogs, grossProfit, operatingExpenses, depreciation, netProfit }
        })

        const totals = months.reduce(
          (acc, m) => ({
            revenue: acc.revenue + m.revenue,
            cogs: acc.cogs + m.cogs,
            grossProfit: acc.grossProfit + m.grossProfit,
            operatingExpenses: acc.operatingExpenses + m.operatingExpenses,
            depreciation: acc.depreciation + (m.depreciation ?? 0),
            netProfit: acc.netProfit + m.netProfit,
          }),
          { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, depreciation: 0, netProfit: 0 },
        )

        return { year: y, months, totals }
      }

      const primary = await fetchPnLForYear(year)
      const compare = compareYear ? await fetchPnLForYear(compareYear) : null
      return ok({ primary, compare })
    }

    // ─── REPORTS / BALANCE-SHEET (as-of date) ─────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'balance-sheet' && method === 'GET') {
      const asOf = sp.get('date') ?? new Date().toISOString().slice(0, 10)
      const asOfEnd = `${asOf}T23:59:59.999Z`

      // Cash: sum of paid orders up to asOf date
      const cashRow = await queryOne<any>(
        `SELECT COALESCE(SUM(total), 0) as cash
         FROM "Order"
         WHERE storeId=? AND status='PAID' AND createdAt <= ?`,
        [storeId, asOfEnd],
      )

      // Inventory value: current stock × cost
      const inventoryRow = await queryOne<any>(
        `SELECT COALESCE(SUM(p.stock * COALESCE(p.cost, 0)), 0) as inventory
         FROM Product p
         WHERE p.storeId=?`,
        [storeId],
      )

      // Accounts Receivable: unpaid invoices (orders not yet paid)
      const arRow = await queryOne<any>(
        `SELECT COALESCE(SUM(total), 0) as ar
         FROM "Order"
         WHERE storeId=? AND status NOT IN ('PAID','CANCELLED','REFUNDED')
           AND createdAt <= ?`,
        [storeId, asOfEnd],
      )

      // Accounts Payable: pending purchase orders
      const apRow = await queryOne<any>(
        `SELECT COALESCE(SUM(total), 0) as ap
         FROM PurchaseOrder
         WHERE storeId=? AND status NOT IN ('RECEIVED','CANCELLED')
           AND createdAt <= ?`,
        [storeId, asOfEnd],
      )

      const cash = Number(cashRow?.cash ?? 0)
      const inventory = Number(inventoryRow?.inventory ?? 0)
      const accountsReceivable = Number(arRow?.ar ?? 0)
      const accountsPayable = Number(apRow?.ap ?? 0)

      const totalAssets = cash + inventory + accountsReceivable
      const totalLiabilities = accountsPayable
      const equity = totalAssets - totalLiabilities
      const isBalanced = Math.abs(totalAssets - (totalLiabilities + equity)) < 0.01

      return ok({
        asOf,
        assets: {
          cash,
          inventory,
          accountsReceivable,
          total: totalAssets,
        },
        liabilities: {
          accountsPayable,
          total: totalLiabilities,
        },
        equity,
        totalAssets,
        totalLiabilities,
        isBalanced,
      })
    }

    // ─── REPORTS / STAFF ──────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'staff' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()

      // Aggregate orders by cashier (userId), join with User for name
      const staffRows = await query(
        `SELECT
           o.userId,
           COALESCE(u.name, 'Unknown') as name,
           COUNT(o.id)               as totalOrders,
           COALESCE(SUM(o.total), 0) as totalRevenue,
           COALESCE(AVG(o.total), 0) as avgOrderValue,
           COALESCE(SUM(oi.qty), 0)  as itemsSold
         FROM "Order" o
         LEFT JOIN User u ON o.userId = u.id
         LEFT JOIN OrderItem oi ON oi.orderId = o.id
         WHERE o.storeId = ? AND o.status = 'PAID'
           AND o.createdAt BETWEEN ? AND ?
           AND o.userId IS NOT NULL
         GROUP BY o.userId
         ORDER BY totalRevenue DESC`,
        [storeId, from, to],
      )

      // Fetch commission rates for all users in the result
      const userIds = (staffRows as any[]).map((r: any) => r.userId)
      let commissionMap: Record<string, number> = {}
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',')
        const empRows = await query(
          `SELECT userId, commissionRate FROM Employee WHERE storeId = ? AND userId IN (${placeholders})`,
          [storeId, ...userIds],
        )
        for (const e of empRows as any[]) {
          commissionMap[e.userId] = Number(e.commissionRate ?? 0)
        }
      }

      const result = (staffRows as any[]).map((r: any) => {
        const commissionRate = commissionMap[r.userId] ?? 0
        const totalRevenue = Number(r.totalRevenue)
        const commissionEarned = (totalRevenue * commissionRate) / 100
        return {
          userId: r.userId,
          name: r.name,
          totalOrders: Number(r.totalOrders),
          totalRevenue,
          avgOrderValue: Number(r.avgOrderValue),
          itemsSold: Number(r.itemsSold),
          commissionRate,
          commissionEarned,
        }
      })

      return ok(result)
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

    // ─── ASSETS ───────────────────────────────────────────────────────────────
    if (segs[0] === 'assets') {
      // Lazy-init tables
      await exec(`CREATE TABLE IF NOT EXISTS Asset (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Peralatan',
        purchaseDate TEXT NOT NULL,
        purchasePrice REAL NOT NULL DEFAULT 0,
        usefulLife INTEGER NOT NULL DEFAULT 5,
        method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
        salvageValue REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`)
      await exec(`CREATE TABLE IF NOT EXISTS MaintenanceLog (
        id TEXT PRIMARY KEY,
        assetId TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      )`)

      // GET /api/assets — list assets for store
      if (segs.length === 1 && method === 'GET') {
        const rows = await query(
          `SELECT * FROM Asset WHERE storeId = ? ORDER BY createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }

      // POST /api/assets — create asset
      if (segs.length === 1 && method === 'POST') {
        const b: any = await req.json()
        validateRequired(b, ['name', 'purchaseDate', 'purchasePrice', 'usefulLife'])
        validatePositive(b.purchasePrice, 'purchasePrice')
        if (Number(b.usefulLife) < 1)
          throw new ValidationError('usefulLife must be at least 1', 'INVALID_VALUE')
        const t = nowISO()
        const id = newId()
        await exec(
          `INSERT INTO Asset (id,storeId,name,category,purchaseDate,purchasePrice,usefulLife,method,salvageValue,status,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.name,
            b.category ?? 'Peralatan',
            b.purchaseDate,
            Number(b.purchasePrice),
            Number(b.usefulLife),
            b.method ?? 'STRAIGHT_LINE',
            Number(b.salvageValue) || 0,
            b.status ?? 'ACTIVE',
            t,
            t,
          ],
        )
        return ok({ id, name: b.name }, 201)
      }

      // PATCH /api/assets/:id — update asset
      if (segs.length === 2 && method === 'PATCH') {
        const assetId = segs[1]
        const b: any = await req.json()
        const ALLOWED_ASSET_COLS = new Set([
          'name', 'category', 'purchaseDate', 'purchasePrice',
          'usefulLife', 'method', 'salvageValue', 'status',
        ])
        const cols = filterCols(b, ALLOWED_ASSET_COLS)
        if (Object.keys(cols).length === 0) return err('No valid fields to update')
        const t = nowISO()
        const { setClauses, values } = buildUpdate(cols)
        await exec(
          `UPDATE Asset SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
          [...values, t, assetId, storeId],
        )
        return ok({ success: true })
      }

      // GET /api/assets/:id/maintenance — list maintenance logs
      if (segs.length === 3 && segs[2] === 'maintenance' && method === 'GET') {
        const assetId = segs[1]
        const rows = await query(
          `SELECT * FROM MaintenanceLog WHERE assetId = ? ORDER BY date DESC, createdAt DESC`,
          [assetId],
        )
        return ok(rows)
      }

      // POST /api/assets/:id/maintenance — add maintenance log
      if (segs.length === 3 && segs[2] === 'maintenance' && method === 'POST') {
        const assetId = segs[1]
        const b: any = await req.json()
        validateRequired(b, ['date', 'description'])
        const t = nowISO()
        const id = newId()
        await exec(
          `INSERT INTO MaintenanceLog (id,assetId,date,description,cost,createdAt) VALUES (?,?,?,?,?,?)`,
          [id, assetId, b.date, b.description, Number(b.cost) || 0, t],
        )
        return ok({ id }, 201)
      }
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
      // Lazy-init SupplierProduct and SupplierRating tables
      await exec(
        `CREATE TABLE IF NOT EXISTS SupplierProduct (
          id            TEXT PRIMARY KEY,
          storeId       TEXT NOT NULL,
          supplierId    TEXT NOT NULL,
          productId     TEXT NOT NULL,
          supplierPrice REAL NOT NULL DEFAULT 0,
          minOrderQty   INTEGER NOT NULL DEFAULT 1,
          leadTimeDays  INTEGER NOT NULL DEFAULT 0,
          createdAt     TEXT NOT NULL,
          updatedAt     TEXT NOT NULL
        )`,
        [],
      )
      await exec(
        `CREATE TABLE IF NOT EXISTS SupplierRating (
          id         TEXT PRIMARY KEY,
          storeId    TEXT NOT NULL,
          supplierId TEXT NOT NULL,
          orderId    TEXT,
          rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
          notes      TEXT,
          createdAt  TEXT NOT NULL
        )`,
        [],
      )

      // GET /api/suppliers — list with purchase aggregates
      if (!segs[1] && method === 'GET') {
        const search = url.searchParams.get('search') ?? ''
        const rows = search
          ? await query(
              `SELECT s.*,
                 COALESCE(SUM(po.total),0)   AS totalPurchases,
                 COUNT(po.id)                AS totalOrders,
                 MAX(po.createdAt)           AS lastOrderDate,
                 ROUND(AVG(sr.rating),1)     AS avgRating,
                 COUNT(DISTINCT sr.id)       AS ratingCount
               FROM Supplier s
               LEFT JOIN PurchaseOrder po ON po.supplierId=s.id AND po.storeId=s.storeId
               LEFT JOIN SupplierRating sr ON sr.supplierId=s.id AND sr.storeId=s.storeId
               WHERE s.storeId=? AND s.active=1 AND s.name LIKE ?
               GROUP BY s.id ORDER BY s.name`,
              [storeId, `%${search}%`],
            )
          : await query(
              `SELECT s.*,
                 COALESCE(SUM(po.total),0)   AS totalPurchases,
                 COUNT(po.id)                AS totalOrders,
                 MAX(po.createdAt)           AS lastOrderDate,
                 ROUND(AVG(sr.rating),1)     AS avgRating,
                 COUNT(DISTINCT sr.id)       AS ratingCount
               FROM Supplier s
               LEFT JOIN PurchaseOrder po ON po.supplierId=s.id AND po.storeId=s.storeId
               LEFT JOIN SupplierRating sr ON sr.supplierId=s.id AND sr.storeId=s.storeId
               WHERE s.storeId=? AND s.active=1
               GROUP BY s.id ORDER BY s.name`,
              [storeId],
            )
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

      // GET /api/suppliers/:id/products — supplier price list
      if (segs[1] && segs[2] === 'products' && method === 'GET') {
        const rows = await query(
          `SELECT sp.*, p.name as productName, p.sku, p.price as retailPrice
           FROM SupplierProduct sp
           JOIN Product p ON sp.productId = p.id
           WHERE sp.supplierId=? AND sp.storeId=?
           ORDER BY p.name`,
          [segs[1], storeId],
        )
        return ok(rows)
      }
      // POST /api/suppliers/:id/products — upsert a product in price list
      if (segs[1] && segs[2] === 'products' && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.productId) return err('productId harus diisi')
        if (b.supplierPrice === undefined || Number(b.supplierPrice) < 0)
          return err('supplierPrice harus >= 0')
        const existing = await queryOne<any>(
          `SELECT id FROM SupplierProduct WHERE supplierId=? AND productId=? AND storeId=?`,
          [segs[1], b.productId, storeId],
        )
        const t = nowISO()
        if (existing) {
          await exec(
            `UPDATE SupplierProduct SET supplierPrice=?,minOrderQty=?,leadTimeDays=?,updatedAt=? WHERE id=?`,
            [
              Number(b.supplierPrice),
              Number(b.minOrderQty ?? 1),
              Number(b.leadTimeDays ?? 0),
              t,
              existing.id,
            ],
          )
          return ok({ id: existing.id })
        }
        const id = newId()
        await exec(
          `INSERT INTO SupplierProduct (id,storeId,supplierId,productId,supplierPrice,minOrderQty,leadTimeDays,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            segs[1],
            b.productId,
            Number(b.supplierPrice),
            Number(b.minOrderQty ?? 1),
            Number(b.leadTimeDays ?? 0),
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }
      // DELETE /api/suppliers/:id/products/:productId
      if (segs[1] && segs[2] === 'products' && segs[3] && method === 'DELETE') {
        await exec(`DELETE FROM SupplierProduct WHERE supplierId=? AND productId=? AND storeId=?`, [
          segs[1],
          segs[3],
          storeId,
        ])
        return ok({ success: true })
      }

      // GET /api/suppliers/:id/ratings
      if (segs[1] && segs[2] === 'ratings' && method === 'GET') {
        const rows = await query(
          `SELECT sr.*, po.number as orderNumber
           FROM SupplierRating sr
           LEFT JOIN PurchaseOrder po ON sr.orderId = po.id
           WHERE sr.supplierId=? AND sr.storeId=?
           ORDER BY sr.createdAt DESC`,
          [segs[1], storeId],
        )
        const agg = await queryOne<any>(
          `SELECT ROUND(AVG(rating),2) as avg, COUNT(*) as count FROM SupplierRating WHERE supplierId=? AND storeId=?`,
          [segs[1], storeId],
        )
        return ok({ ratings: rows, avg: agg?.avg ?? null, count: agg?.count ?? 0 })
      }
      // POST /api/suppliers/:id/ratings
      if (segs[1] && segs[2] === 'ratings' && method === 'POST') {
        const b = (await req.json()) as any
        const rating = Number(b.rating)
        if (!rating || rating < 1 || rating > 5) return err('Rating harus antara 1-5')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO SupplierRating (id,storeId,supplierId,orderId,rating,notes,createdAt) VALUES (?,?,?,?,?,?,?)`,
          [id, storeId, segs[1], b.orderId ?? null, rating, b.notes ?? null, t],
        )
        return ok({ id }, 201)
      }

      if (segs[1] && !segs[2] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set([
          'name',
          'email',
          'phone',
          'address',
          'taxId',
          'notes',
          'active',
          'contactPerson',
          'city',
        ])
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
      if (segs[1] && !segs[2] && method === 'DELETE') {
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
        const supplierId = url.searchParams.get('supplierId') ?? ''
        const limit = parseInt(url.searchParams.get('limit') ?? '50')
        const offset = parseInt(url.searchParams.get('offset') ?? '0')
        const conditions: string[] = ['po.storeId=?']
        const params: any[] = [storeId]
        if (status) {
          conditions.push('po.status=?')
          params.push(status)
        }
        if (supplierId) {
          conditions.push('po.supplierId=?')
          params.push(supplierId)
        }
        const where = conditions.join(' AND ')
        const rows = await query(
          `SELECT po.*, s.name as supplierName
           FROM PurchaseOrder po
           JOIN Supplier s ON po.supplierId = s.id
           WHERE ${where}
           ORDER BY po.createdAt DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset],
        )
        const total = await queryOne<any>(
          `SELECT COUNT(*) as count FROM PurchaseOrder po WHERE ${where}`,
          params,
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

    // ─── REWARDS MARKETPLACE ─────────────────────────────────────────────────
    // Lazy-init RewardItem table
    async function ensureRewardItemTable() {
      await exec(
        `CREATE TABLE IF NOT EXISTS RewardItem (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          pointsCost INTEGER NOT NULL DEFAULT 0,
          type TEXT NOT NULL DEFAULT 'DISCOUNT_VOUCHER',
          value REAL NOT NULL DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT -1,
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )`,
        [],
      )
      await exec(
        `CREATE TABLE IF NOT EXISTS RewardVoucher (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          rewardItemId TEXT NOT NULL,
          customerId TEXT NOT NULL,
          code TEXT NOT NULL UNIQUE,
          used INTEGER NOT NULL DEFAULT 0,
          usedAt TEXT,
          createdAt TEXT NOT NULL
        )`,
        [],
      )
    }

    if (segs[0] === 'rewards') {
      await ensureRewardItemTable()

      // GET /api/rewards — list all active rewards for this store
      if (segs.length === 1 && method === 'GET') {
        const rewards = await query(
          `SELECT * FROM RewardItem WHERE storeId=? AND active=1 ORDER BY pointsCost ASC`,
          [storeId],
        )
        return ok(rewards)
      }

      // POST /api/rewards — create a reward item (owner/manager only)
      if (segs.length === 1 && method === 'POST') {
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'MANAGER'].includes(callerRole)) return err('Forbidden', 403)
        const b = (await req.json()) as any
        if (!b.name?.trim()) return err('name is required')
        if (!b.type || !['DISCOUNT_VOUCHER', 'FREE_PRODUCT', 'CASHBACK'].includes(b.type))
          return err('type must be DISCOUNT_VOUCHER, FREE_PRODUCT, or CASHBACK')
        if (Number(b.pointsCost) <= 0) return err('pointsCost must be > 0')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO RewardItem (id,storeId,name,description,pointsCost,type,value,stock,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,1,?,?)`,
          [
            id,
            storeId,
            b.name.trim(),
            b.description ?? null,
            Number(b.pointsCost),
            b.type,
            Number(b.value ?? 0),
            b.stock !== undefined ? Number(b.stock) : -1,
            t,
            t,
          ],
        )
        return ok({ id }, 201)
      }

      // POST /api/rewards/:id/redeem — customer redeems a reward
      if (segs.length === 3 && segs[2] === 'redeem' && method === 'POST') {
        const rewardId = segs[1]
        const b = (await req.json()) as any
        if (!b.customerId) return err('customerId is required')

        const reward = await queryOne<any>(
          `SELECT * FROM RewardItem WHERE id=? AND storeId=? AND active=1`,
          [rewardId, storeId],
        )
        if (!reward) return err('Reward not found or inactive', 404)
        if (reward.stock !== -1 && reward.stock <= 0) return err('Reward out of stock', 400)

        const customer = await queryOne<any>(
          `SELECT id, points FROM Customer WHERE id=? AND storeId=?`,
          [b.customerId, storeId],
        )
        if (!customer) return err('Customer not found', 404)
        if (customer.points < reward.pointsCost) return err('Insufficient points', 400)

        // Generate voucher code
        const voucherCode = `RWD-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
        const vid = newId()
        const t = nowISO()

        // Deduct points and create voucher in one batch
        await exec(
          `UPDATE Customer SET points = MAX(0, points - ?), updatedAt=? WHERE id=? AND storeId=?`,
          [reward.pointsCost, t, b.customerId, storeId],
        )
        await exec(
          `INSERT INTO RewardVoucher (id,storeId,rewardItemId,customerId,code,used,createdAt) VALUES (?,?,?,?,?,0,?)`,
          [vid, storeId, rewardId, b.customerId, voucherCode, t],
        )
        if (reward.stock !== -1) {
          await exec(
            `UPDATE RewardItem SET stock = stock - 1, updatedAt=? WHERE id=? AND storeId=?`,
            [t, rewardId, storeId],
          )
        }
        // Record redemption
        await exec(
          `INSERT INTO LoyaltyRedemption (id,storeId,customerId,orderId,pointsRedeemed,discountGiven,createdAt) VALUES (?,?,?,?,?,?,?)`,
          [newId(), storeId, b.customerId, null, reward.pointsCost, 0, t],
        )

        return ok(
          {
            voucherCode,
            rewardName: reward.name,
            rewardType: reward.type,
            rewardValue: reward.value,
            pointsDeducted: reward.pointsCost,
          },
          201,
        )
      }
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
        const newStatus = b.status ?? wo.status
        const actualStart = newStatus === 'IN_PROGRESS' ? t : (wo.actualStart ?? null)
        const completedAt = newStatus === 'COMPLETED' ? t : (wo.completedAt ?? null)
        const producedQty = b.producedQty !== undefined ? Number(b.producedQty) : wo.producedQty

        // ── DRAFT → IN_PROGRESS: reserve raw materials (decrement component stock) ──
        if (b.status === 'IN_PROGRESS' && wo.status === 'DRAFT') {
          const materials = (await query(`SELECT * FROM WorkOrderMaterial WHERE workOrderId=?`, [
            segs[1],
          ])) as any[]
          for (const mat of materials) {
            await exec(
              `UPDATE Product SET stock = stock - ?, updatedAt=? WHERE id=? AND storeId=?`,
              [mat.requiredQty, t, mat.productId, storeId],
            )
            await exec(
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [
                newId(),
                mat.productId,
                'OUT',
                mat.requiredQty,
                `WO ${wo.number} – material reserved`,
                t,
              ],
            )
          }
        }

        // ── IN_PROGRESS → COMPLETED: increment finished product stock ────────────
        if (b.status === 'COMPLETED' && wo.status === 'IN_PROGRESS') {
          const bom = (await queryOne(`SELECT * FROM BillOfMaterials WHERE id=? AND storeId=?`, [
            wo.bomId,
            storeId,
          ])) as any
          if (bom?.outputProductId) {
            const finishedQty = producedQty > 0 ? producedQty : wo.plannedQty
            await exec(
              `UPDATE Product SET stock = stock + ?, updatedAt=? WHERE id=? AND storeId=?`,
              [finishedQty, t, bom.outputProductId, storeId],
            )
            await exec(
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [
                newId(),
                bom.outputProductId,
                'IN',
                finishedQty,
                `WO ${wo.number} – production completed`,
                t,
              ],
            )
          }
        }

        await exec(
          `UPDATE WorkOrder SET status=?, producedQty=?, actualStart=?, completedAt=?, notes=?, updatedAt=? WHERE id=? AND storeId=?`,
          [
            newStatus,
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

    // ── Manufacturing aliases: /api/manufacturing/work-orders and /api/manufacturing/bom/:productId ──
    if (segs[0] === 'manufacturing') {
      // GET /api/manufacturing/work-orders?storeId=
      if (segs[1] === 'work-orders' && !segs[2] && method === 'GET') {
        const rows = await query(
          `SELECT wo.*, b.name as bomName, b.outputProductId,
                  p.name as productName
           FROM WorkOrder wo
           LEFT JOIN BillOfMaterials b ON wo.bomId = b.id
           LEFT JOIN Product p ON b.outputProductId = p.id
           WHERE wo.storeId=? ORDER BY wo.createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }
      // POST /api/manufacturing/work-orders
      if (segs[1] === 'work-orders' && !segs[2] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.bomId) return err('bomId required')
        if (!b.plannedQty || Number(b.plannedQty) <= 0) return err('plannedQty must be > 0')
        const bom = (await queryOne(`SELECT * FROM BillOfMaterials WHERE id=? AND storeId=?`, [
          b.bomId,
          storeId,
        ])) as any
        if (!bom) return err('BOM not found', 404)
        const id = newId()
        const t = nowISO()
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
      // PATCH /api/manufacturing/work-orders/:id
      if (segs[1] === 'work-orders' && segs[2] && method === 'PATCH') {
        // Delegate to the existing work-orders PATCH by re-invoking with adjusted segs
        // (inline the same logic for the alias path)
        const b = (await req.json()) as any
        const wo = (await queryOne(`SELECT * FROM WorkOrder WHERE id=? AND storeId=?`, [
          segs[2],
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
          return err(`Cannot transition from ${wo.status} to ${b.status}`)
        }
        const t = nowISO()
        const newStatus = b.status ?? wo.status
        const actualStart = newStatus === 'IN_PROGRESS' ? t : (wo.actualStart ?? null)
        const completedAt = newStatus === 'COMPLETED' ? t : (wo.completedAt ?? null)
        const producedQty = b.producedQty !== undefined ? Number(b.producedQty) : wo.producedQty
        if (b.status === 'IN_PROGRESS' && wo.status === 'DRAFT') {
          const materials = (await query(`SELECT * FROM WorkOrderMaterial WHERE workOrderId=?`, [
            segs[2],
          ])) as any[]
          for (const mat of materials) {
            await exec(
              `UPDATE Product SET stock = stock - ?, updatedAt=? WHERE id=? AND storeId=?`,
              [mat.requiredQty, t, mat.productId, storeId],
            )
            await exec(
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [
                newId(),
                mat.productId,
                'OUT',
                mat.requiredQty,
                `WO ${wo.number} – material reserved`,
                t,
              ],
            )
          }
        }
        if (b.status === 'COMPLETED' && wo.status === 'IN_PROGRESS') {
          const bom = (await queryOne(`SELECT * FROM BillOfMaterials WHERE id=? AND storeId=?`, [
            wo.bomId,
            storeId,
          ])) as any
          if (bom?.outputProductId) {
            const finishedQty = producedQty > 0 ? producedQty : wo.plannedQty
            await exec(
              `UPDATE Product SET stock = stock + ?, updatedAt=? WHERE id=? AND storeId=?`,
              [finishedQty, t, bom.outputProductId, storeId],
            )
            await exec(
              `INSERT INTO StockLog (id,productId,type,qty,note,createdAt) VALUES (?,?,?,?,?,?)`,
              [
                newId(),
                bom.outputProductId,
                'IN',
                finishedQty,
                `WO ${wo.number} – production completed`,
                t,
              ],
            )
          }
        }
        await exec(
          `UPDATE WorkOrder SET status=?, producedQty=?, actualStart=?, completedAt=?, notes=?, updatedAt=? WHERE id=? AND storeId=?`,
          [
            newStatus,
            producedQty,
            actualStart,
            completedAt,
            b.notes ?? wo.notes,
            t,
            segs[2],
            storeId,
          ],
        )
        return ok({ success: true })
      }
      // GET /api/manufacturing/bom/:productId
      if (segs[1] === 'bom' && segs[2] && !segs[3] && method === 'GET') {
        const productId = segs[2]
        const bom = await queryOne(
          `SELECT b.*, p.name as outputProductName FROM BillOfMaterials b LEFT JOIN Product p ON b.outputProductId = p.id WHERE b.outputProductId=? AND b.storeId=? AND b.active=1 ORDER BY b.createdAt DESC`,
          [productId, storeId],
        )
        if (!bom) return ok(null)
        const components = await query(
          `SELECT bc.*, p.name as productName FROM BOMComponent bc LEFT JOIN Product p ON bc.productId = p.id WHERE bc.bomId=?`,
          [(bom as any).id],
        )
        return ok({ ...(bom as any), components })
      }
      // POST /api/manufacturing/bom/:productId — add/replace BOM component
      if (segs[1] === 'bom' && segs[2] && !segs[3] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.productId) return err('componentProductId required')
        if (!b.qty || Number(b.qty) <= 0) return err('qty must be > 0')
        // Find or create BOM for the output product
        let bom = (await queryOne(
          `SELECT * FROM BillOfMaterials WHERE outputProductId=? AND storeId=? AND active=1`,
          [segs[2], storeId],
        )) as any
        const t = nowISO()
        if (!bom) {
          const product = (await queryOne(`SELECT name FROM Product WHERE id=? AND storeId=?`, [
            segs[2],
            storeId,
          ])) as any
          if (!product) return err('Product not found', 404)
          const bomId = newId()
          await exec(
            `INSERT INTO BillOfMaterials (id,storeId,name,description,outputProductId,outputQty,unit,active,createdAt,updatedAt) VALUES (?,?,?,?,?,1,'pcs',1,?,?)`,
            [bomId, storeId, `${product.name} BOM`, null, segs[2], t, t],
          )
          bom = { id: bomId }
        }
        // Upsert component
        const existing = (await queryOne(
          `SELECT id FROM BOMComponent WHERE bomId=? AND productId=?`,
          [bom.id, b.productId],
        )) as any
        if (existing) {
          await exec(`UPDATE BOMComponent SET qty=?, unit=?, notes=? WHERE id=?`, [
            Number(b.qty),
            b.unit ?? 'pcs',
            b.notes ?? null,
            existing.id,
          ])
        } else {
          await exec(
            `INSERT INTO BOMComponent (id,bomId,productId,qty,unit,notes) VALUES (?,?,?,?,?,?)`,
            [newId(), bom.id, b.productId, Number(b.qty), b.unit ?? 'pcs', b.notes ?? null],
          )
        }
        return ok({ success: true, bomId: bom.id }, 201)
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

    // ─── GIFT CARDS ───────────────────────────────────────────────────────────
    if (segs[0] === 'gift-cards') {
      // Lazy table creation — runs once per cold start, no-op thereafter
      await exec(
        `CREATE TABLE IF NOT EXISTS GiftCard (
          id              TEXT PRIMARY KEY,
          storeId         TEXT NOT NULL,
          code            TEXT NOT NULL UNIQUE,
          balance         REAL NOT NULL DEFAULT 0,
          originalBalance REAL NOT NULL DEFAULT 0,
          expiresAt       TEXT,
          status          TEXT NOT NULL DEFAULT 'ACTIVE',
          issuedTo        TEXT,
          createdAt       TEXT NOT NULL
        )`,
        [],
      )

      // GET /api/gift-cards?storeId= — list active gift cards for the store
      if (segs.length === 1 && method === 'GET') {
        const rows = await query(
          `SELECT g.*, c.name as customerName
           FROM GiftCard g
           LEFT JOIN Customer c ON g.issuedTo = c.id
           WHERE g.storeId = ?
           ORDER BY g.createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }

      // POST /api/gift-cards — issue a new gift card
      if (segs.length === 1 && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.balance || Number(b.balance) <= 0) return err('balance must be positive')
        const code = generateGiftCardCode()
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO GiftCard (id,storeId,code,balance,originalBalance,expiresAt,status,issuedTo,createdAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            code,
            Number(b.balance),
            Number(b.balance),
            b.expiresAt || null,
            'ACTIVE',
            b.issuedTo || null,
            t,
          ],
        )
        return ok({ id, code, balance: Number(b.balance) }, 201)
      }

      // GET /api/gift-cards/:code — look up by code (used at POS)
      if (segs.length === 2 && method === 'GET') {
        const code = segs[1].toUpperCase()
        const card = await queryOne<any>(
          `SELECT g.*, c.name as customerName
           FROM GiftCard g
           LEFT JOIN Customer c ON g.issuedTo = c.id
           WHERE g.code = ? AND g.storeId = ?`,
          [code, storeId],
        )
        if (!card) return err('Gift card not found', 404)
        // Return with resolved live status
        const liveStatus = resolveGiftCardStatus(card.balance, card.expiresAt)
        return ok({ ...card, status: liveStatus })
      }

      // PATCH /api/gift-cards/:code/redeem — deduct balance
      if (segs.length === 3 && segs[2] === 'redeem' && method === 'PATCH') {
        const code = segs[1].toUpperCase()
        const b = (await req.json()) as any
        const amount = Number(b.amount)
        if (!amount || amount <= 0) return err('amount must be positive')

        const card = await queryOne<any>(`SELECT * FROM GiftCard WHERE code = ? AND storeId = ?`, [
          code,
          storeId,
        ])
        if (!card) return err('Gift card not found', 404)

        const liveStatus = resolveGiftCardStatus(card.balance, card.expiresAt)
        if (liveStatus === 'EXPIRED') return err('Gift card has expired', 400)
        if (liveStatus === 'USED') return err('Gift card has no remaining balance', 400)

        const { newBalance, applied } = deductGiftCardBalance(card.balance, amount)
        const newStatus = resolveGiftCardStatus(newBalance, card.expiresAt)

        await exec(`UPDATE GiftCard SET balance = ?, status = ? WHERE code = ? AND storeId = ?`, [
          newBalance,
          newStatus,
          code,
          storeId,
        ])
        return ok({ applied, newBalance, status: newStatus })
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

    // ─── KITCHEN TICKETS (KOT) ────────────────────────────────────────────────
    if (segs[0] === 'kitchen' && segs[1] === 'tickets') {
      // Lazy migration — idempotent
      await exec(`CREATE TABLE IF NOT EXISTS KitchenTicket (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        tableNumber INTEGER NOT NULL,
        items TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        note TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`)

      // GET /api/kitchen/tickets — list open tickets for this store
      if (segs.length === 2 && method === 'GET') {
        const statusFilter = sp.get('status') // optional: PENDING|IN_PROGRESS|COMPLETED
        let sql = `SELECT * FROM KitchenTicket WHERE storeId = ?`
        const params: any[] = [storeId]
        if (statusFilter) {
          sql += ` AND status = ?`
          params.push(statusFilter)
        } else {
          // Default: exclude COMPLETED tickets older than 1 hour
          sql += ` AND (status != 'COMPLETED' OR updatedAt > datetime('now', '-1 hour'))`
        }
        sql += ` ORDER BY createdAt ASC`
        const rows = await query(sql, params)
        // Parse items JSON for each row
        const tickets = (rows as any[]).map(r => ({
          ...r,
          items: JSON.parse(r.items),
        }))
        return ok(tickets)
      }

      // POST /api/kitchen/tickets — create new KOT
      if (segs.length === 2 && method === 'POST') {
        const b: any = await req.json()
        validateRequired(b, ['tableNumber', 'items'])
        const tableNumber = Number(b.tableNumber)
        if (!Number.isInteger(tableNumber) || tableNumber < 1)
          return err('tableNumber must be a positive integer')
        if (!Array.isArray(b.items) || b.items.length === 0)
          return err('items must be a non-empty array')
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO KitchenTicket (id, storeId, tableNumber, items, status, note, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
          [id, storeId, tableNumber, JSON.stringify(b.items), b.note ?? null, t, t],
        )
        return ok(
          {
            id,
            storeId,
            tableNumber,
            items: b.items,
            status: 'PENDING',
            note: b.note ?? null,
            createdAt: t,
            updatedAt: t,
          },
          201,
        )
      }

      // PATCH /api/kitchen/tickets/:id — update status
      if (segs.length === 3 && method === 'PATCH') {
        const ticketId = segs[2]
        const b: any = await req.json()
        const validStatuses = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED'])
        if (!b.status || !validStatuses.has(b.status))
          return err('status must be PENDING | IN_PROGRESS | COMPLETED')
        const t = nowISO()
        await exec(
          `UPDATE KitchenTicket SET status = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
          [b.status, t, ticketId, storeId],
        )
        return ok({ success: true })
      }
    }

    // ─── TABLES ───────────────────────────────────────────────────────────────
    if (segs[0] === 'tables') {
      // Lazy migration — run once per cold start; idempotent
      await exec(`CREATE TABLE IF NOT EXISTS RestaurantTable (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'FREE',
        currentOrderId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`)

      // GET /api/tables?storeId= — list tables with current order total
      if (segs.length === 1 && method === 'GET') {
        const rows = await query(
          `SELECT t.*,
                  o.total as currentOrderTotal
           FROM RestaurantTable t
           LEFT JOIN "Order" o ON t.currentOrderId = o.id
           WHERE t.storeId = ?
           ORDER BY t.number`,
          [storeId],
        )
        return ok(rows)
      }

      // POST /api/tables — create table
      if (segs.length === 1 && method === 'POST') {
        const b: any = await req.json()
        if (b.number === undefined || b.number === null) return err('number is required')
        const tableNumber = Number(b.number)
        if (!Number.isInteger(tableNumber) || tableNumber < 1)
          return err('number must be a positive integer')
        // Prevent duplicate table numbers in the same store
        const existing = await queryOne(
          `SELECT id FROM RestaurantTable WHERE storeId = ? AND number = ?`,
          [storeId, tableNumber],
        )
        if (existing) return err(`Meja nomor ${tableNumber} sudah ada`, 409)
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO RestaurantTable (id, storeId, number, status, currentOrderId, createdAt, updatedAt)
           VALUES (?, ?, ?, 'FREE', NULL, ?, ?)`,
          [id, storeId, tableNumber, t, t],
        )
        return ok({ id, storeId, number: tableNumber, status: 'FREE', currentOrderId: null }, 201)
      }

      // PATCH /api/tables/:id — update status / currentOrderId
      if (segs.length === 2 && method === 'PATCH') {
        const tableId = segs[1]
        const b: any = await req.json()
        const validStatuses = new Set(['FREE', 'OCCUPIED', 'RESERVED'])
        const updates: Record<string, any> = {}
        if (b.status !== undefined) {
          if (!validStatuses.has(b.status)) return err('Invalid status')
          updates.status = b.status
        }
        if ('currentOrderId' in b) {
          updates.currentOrderId = b.currentOrderId ?? null
        }
        if (Object.keys(updates).length === 0) return err('No valid fields to update')
        const t = nowISO()
        const { setClauses, values } = buildUpdate(updates)
        await exec(
          `UPDATE RestaurantTable SET ${setClauses}, updatedAt = ? WHERE id = ? AND storeId = ?`,
          [...values, t, tableId, storeId],
        )
        return ok({ success: true })
      }
    }

    // ─── REPORTS / TAX ────────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'tax' && method === 'GET') {
      const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
      if (isNaN(year) || year < 2000 || year > 2100) return err('Invalid year', 400)
      const fromStr = `${year}-01-01T00:00:00.000Z`
      const toStr = `${year}-12-31T23:59:59.999Z`
      const monthRows = await query<any>(
        `SELECT
           CAST(strftime('%m', datetime(createdAt)) AS INTEGER) AS month,
           SUM(total)   AS grossRevenue,
           SUM(taxAmt)  AS taxCollected,
           COUNT(*)     AS orderCount
         FROM "Order"
         WHERE storeId = ?
           AND status  = 'PAID'
           AND createdAt BETWEEN ? AND ?
         GROUP BY month
         ORDER BY month`,
        [storeId, fromStr, toStr],
      )
      const result = monthRows.map((r: any) => {
        const gross = Number(r.grossRevenue ?? 0)
        const tax = Number(r.taxCollected ?? 0)
        // taxableRevenue = DPP = gross × 100/111
        const taxable = Math.round((gross * 100) / 111)
        return {
          month: Number(r.month),
          grossRevenue: gross,
          taxableRevenue: taxable,
          taxCollected: tax,
          orderCount: Number(r.orderCount ?? 0),
        }
      })
      return okCached(result, 'private, max-age=60')
    }

    // ─── REPORTS / ANNUAL ─────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'annual' && method === 'GET') {
      const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
      if (isNaN(year) || year < 2000 || year > 2100) return err('Invalid year', 400)
      const fromStr = `${year}-01-01T00:00:00.000Z`
      const toStr = `${year}-12-31T23:59:59.999Z`
      const dateFrom = `${year}-01-01`
      const dateTo = `${year}-12-31`
      const [revenueRow, expensesRow] = await Promise.all([
        queryOne<any>(
          `SELECT
             COALESCE(SUM(total),   0) AS totalRevenue,
             COALESCE(SUM(taxAmt),  0) AS totalTax,
             COUNT(*)                  AS orderCount
           FROM "Order"
           WHERE storeId = ? AND status = 'PAID'
             AND createdAt BETWEEN ? AND ?`,
          [storeId, fromStr, toStr],
        ),
        queryOne<any>(
          `SELECT COALESCE(SUM(amount), 0) AS totalExpenses
           FROM Expense
           WHERE storeId = ? AND date BETWEEN ? AND ?`,
          [storeId, dateFrom, dateTo],
        ),
      ])
      const totalRevenue = Number(revenueRow?.totalRevenue ?? 0)
      const totalTax = Number(revenueRow?.totalTax ?? 0)
      const totalExpenses = Number(expensesRow?.totalExpenses ?? 0)
      const netProfit = totalRevenue - totalExpenses
      return okCached(
        {
          year,
          totalRevenue,
          totalTax,
          totalExpenses,
          netProfit,
          orderCount: Number(revenueRow?.orderCount ?? 0),
        },
        'private, max-age=60',
      )
    }

    // ─── DELIVERY ORDERS ──────────────────────────────────────────────────────
    if (segs[0] === 'delivery-orders') {
      // Lazy-create the DeliveryOrder table
      await exec(
        `
        CREATE TABLE IF NOT EXISTS DeliveryOrder (
          id               TEXT PRIMARY KEY,
          storeId          TEXT NOT NULL,
          orderId          TEXT,
          customerId       TEXT,
          customerName     TEXT,
          address          TEXT NOT NULL,
          status           TEXT NOT NULL DEFAULT 'PENDING',
          driverId         TEXT,
          driverName       TEXT,
          estimatedMinutes INTEGER,
          distanceKm       REAL,
          itemsSummary     TEXT,
          total            REAL NOT NULL DEFAULT 0,
          orderNumber      TEXT,
          createdAt        TEXT NOT NULL
        )
      `,
        [],
      )

      // GET /api/delivery-orders?storeId=&status=
      if (segs.length === 1 && method === 'GET') {
        const statusFilter = sp.get('status')
        let sql = `SELECT * FROM DeliveryOrder WHERE storeId = ?`
        const p: any[] = [storeId]
        if (statusFilter) {
          sql += ` AND status = ?`
          p.push(statusFilter)
        }
        sql += ` ORDER BY createdAt DESC`
        const rows = await query(sql, p)
        return ok(rows)
      }

      // POST /api/delivery-orders
      if (segs.length === 1 && method === 'POST') {
        const b: any = await req.json()
        validateRequired(b, ['address'])
        const id = newId()
        const t = nowISO()
        await exec(
          `INSERT INTO DeliveryOrder
            (id, storeId, orderId, customerId, customerName, address, status, driverId, driverName, estimatedMinutes, distanceKm, itemsSummary, total, orderNumber, createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.orderId ?? null,
            b.customerId ?? null,
            b.customerName ?? null,
            b.address,
            'PENDING',
            null,
            null,
            b.estimatedMinutes != null ? Number(b.estimatedMinutes) : null,
            b.distanceKm != null ? Number(b.distanceKm) : null,
            b.itemsSummary ?? null,
            Number(b.total) || 0,
            b.orderNumber ?? null,
            t,
          ],
        )
        return ok({ id, status: 'PENDING', createdAt: t }, 201)
      }

      // PATCH /api/delivery-orders/:id
      if (segs.length === 2 && method === 'PATCH') {
        const orderId = segs[1]
        const b: any = await req.json()

        const VALID_DELIVERY_STATUSES = [
          'PENDING',
          'PREPARING',
          'ON_DELIVERY',
          'DELIVERED',
          'CANCELLED',
        ]
        const STATUS_TRANSITIONS_MAP: Record<string, string[]> = {
          PENDING: ['PREPARING', 'CANCELLED'],
          PREPARING: ['ON_DELIVERY', 'CANCELLED'],
          ON_DELIVERY: ['DELIVERED', 'CANCELLED'],
          DELIVERED: [],
          CANCELLED: [],
        }

        // Fetch existing order
        const existing = await query<any>(
          `SELECT * FROM DeliveryOrder WHERE id = ? AND storeId = ?`,
          [orderId, storeId],
        )
        if (!existing || existing.length === 0) {
          return err('Delivery order not found', 404, 'NOT_FOUND', requestId, startMs)
        }
        const current = existing[0]

        const updates: Record<string, any> = {}

        if (b.status !== undefined) {
          if (!VALID_DELIVERY_STATUSES.includes(b.status)) {
            return err(`Invalid status: ${b.status}`, 400, 'INVALID_VALUE', requestId, startMs)
          }
          const allowed = STATUS_TRANSITIONS_MAP[current.status as string] ?? []
          if (!allowed.includes(b.status)) {
            return err(
              `Tidak bisa mengubah status dari ${current.status} ke ${b.status}`,
              400,
              'INVALID_TRANSITION',
              requestId,
              startMs,
            )
          }
          updates.status = b.status
        }

        if (b.driverId !== undefined) {
          updates.driverId = b.driverId
          // Resolve driver name
          if (b.driverId) {
            const emp = await query<any>(`SELECT name FROM Employee WHERE id = ? AND storeId = ?`, [
              b.driverId,
              storeId,
            ])
            updates.driverName = emp[0]?.name ?? null
          } else {
            updates.driverName = null
          }
        }

        if (b.estimatedMinutes !== undefined) {
          updates.estimatedMinutes = b.estimatedMinutes != null ? Number(b.estimatedMinutes) : null
        }

        if (Object.keys(updates).length === 0) {
          return err('No valid fields to update', 400, 'MISSING_FIELD', requestId, startMs)
        }

        const setClauses = Object.keys(updates)
          .map(k => `${k} = ?`)
          .join(', ')
        const values = Object.values(updates)
        await exec(`UPDATE DeliveryOrder SET ${setClauses} WHERE id = ? AND storeId = ?`, [
          ...values,
          orderId,
          storeId,
        ])
        return ok({ success: true, ...updates })
      }
    }

    // ─── REPORTS / RFM ───────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'rfm' && method === 'GET') {
      // Pull all customers for this store
      const customers = (await query(
        `SELECT id, name, phone, email FROM Customer WHERE storeId = ?`,
        [storeId],
      )) as any[]

      if (customers.length === 0) return ok([])

      const now = Date.now()

      // Per-customer order stats in one query
      const stats = (await query(
        `SELECT customerId,
                COUNT(*)        AS frequency,
                SUM(total)      AS monetary,
                MAX(createdAt)  AS lastOrderAt
         FROM "Order"
         WHERE storeId = ? AND status = 'PAID' AND customerId IS NOT NULL
         GROUP BY customerId`,
        [storeId],
      )) as any[]

      // Build stats map
      const statsMap = new Map<string, { frequency: number; monetary: number; recency: number }>()
      for (const r of stats) {
        const lastMs = new Date(r.lastOrderAt).getTime()
        const recency = Math.floor((now - lastMs) / 86400000)
        statsMap.set(r.customerId, {
          frequency: Number(r.frequency),
          monetary: Number(r.monetary),
          recency: Math.max(0, recency),
        })
      }

      // Build raw stats array (customers with no orders get high recency + 0 freq/monetary)
      const rawStats = customers.map((c: any) => {
        const s = statsMap.get(c.id)
        return {
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
          recency: s?.recency ?? 9999,
          frequency: s?.frequency ?? 0,
          monetary: s?.monetary ?? 0,
        }
      })

      // Inline RFM computation (mirrors src/lib/rfm.ts — avoids import in edge route)
      function scoreMetricLocal(value: number, allValues: number[], invert: boolean): number {
        if (allValues.length === 0) return 3
        const sorted = [...allValues].sort((a, b) => a - b)
        const rank = sorted.filter(v => v <= value).length
        const pct = rank / sorted.length
        const score = Math.max(1, Math.min(5, Math.ceil(pct * 5)))
        return invert ? 6 - score : score
      }

      function assignSegmentLocal(r: number, f: number, m: number): string {
        const avg = (r + f + m) / 3
        if (r >= 4 && f >= 4 && m >= 4) return 'Champions'
        if (avg >= 3.5 && f >= 3) return 'Loyal'
        if (r >= 4 && f <= 2) return 'New'
        if (r <= 2 && f >= 3) return 'AtRisk'
        if (r <= 2 && f <= 2) return 'Lost'
        return avg >= 2.5 ? 'Loyal' : 'AtRisk'
      }

      const recencies = rawStats.map(c => c.recency)
      const frequencies = rawStats.map(c => c.frequency)
      const monetaries = rawStats.map(c => c.monetary)

      const result = rawStats.map(c => {
        const rScore = scoreMetricLocal(c.recency, recencies, true)
        const fScore = scoreMetricLocal(c.frequency, frequencies, false)
        const mScore = scoreMetricLocal(c.monetary, monetaries, false)
        return {
          ...c,
          scores: { recencyScore: rScore, frequencyScore: fScore, monetaryScore: mScore },
          segment: assignSegmentLocal(rScore, fScore, mScore),
        }
      })

      return okCached(result, 'private, max-age=60')
    }

    // ─── REFERRALS ────────────────────────────────────────────────────────────
    if (segs[0] === 'referrals' && method === 'GET') {
      const customerId = sp.get('customerId')
      if (!customerId) return err('customerId required', 400, 'MISSING_FIELD', requestId, startMs)

      // Verify the customer belongs to this store
      const customer = await queryOne(`SELECT id FROM Customer WHERE id = ? AND storeId = ?`, [
        customerId,
        storeId,
      ])
      if (!customer) return err('Customer not found', 404, 'NOT_FOUND', requestId, startMs)

      // Fetch referrals where this customer is the referrer
      const rows = (await query(
        `SELECT r.id,
                r.referredCustomerId,
                c.name      AS referredCustomerName,
                r.rewarded,
                r.pointsAwarded,
                r.createdAt
         FROM Referral r
         JOIN Customer c ON c.id = r.referredCustomerId
         WHERE r.referrerId = ? AND r.storeId = ?
         ORDER BY r.createdAt DESC`,
        [customerId, storeId],
      )) as any[]

      const referrals = rows.map((r: any) => ({
        id: r.id,
        referredCustomerId: r.referredCustomerId,
        referredCustomerName: r.referredCustomerName ?? 'Unknown',
        createdAt: r.createdAt,
        rewarded: Boolean(r.rewarded),
        pointsAwarded: Number(r.pointsAwarded ?? 0),
      }))

      return ok(referrals)
    }

    // ─── BUDGETS ──────────────────────────────────────────────────────────────
    if (segs[0] === 'budgets') {
      // Lazy-create Budget table
      await exec(`
        CREATE TABLE IF NOT EXISTS Budget (
          id        TEXT PRIMARY KEY,
          storeId   TEXT NOT NULL,
          month     INTEGER NOT NULL,
          year      INTEGER NOT NULL,
          category  TEXT NOT NULL,
          budgetAmount REAL NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          UNIQUE(storeId, month, year, category)
        )
      `)

      if (method === 'GET') {
        const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1))
        const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
        if (isNaN(month) || month < 1 || month > 12) return err('Invalid month', 400)
        if (isNaN(year) || year < 2000 || year > 2100) return err('Invalid year', 400)

        // Fetch budget rows
        const budgetRows = (await query(
          `SELECT * FROM Budget WHERE storeId=? AND month=? AND year=?`,
          [storeId, month, year],
        )) as any[]

        // Compute actual per category for the month
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).toISOString().slice(0, 10)
        const actuals = (await query(
          `SELECT category, COALESCE(SUM(amount),0) as actual
             FROM Expense
            WHERE storeId=? AND date BETWEEN ? AND ?
            GROUP BY category`,
          [storeId, firstDay, lastDay],
        )) as any[]

        const actualMap = new Map<string, number>()
        for (const a of actuals) actualMap.set(a.category, Number(a.actual))

        const result = budgetRows.map((b: any) => ({
          ...b,
          actualAmount: actualMap.get(b.category) ?? 0,
        }))
        return ok(result)
      }

      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.category || b.budgetAmount === undefined) return err('Missing required fields', 400)
        const month = parseInt(b.month ?? new Date().getMonth() + 1)
        const year = parseInt(b.year ?? new Date().getFullYear())
        const id = newId()
        const t = nowISO()
        // Upsert: replace on conflict
        await exec(
          `INSERT INTO Budget (id,storeId,month,year,category,budgetAmount,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(storeId,month,year,category) DO UPDATE SET budgetAmount=excluded.budgetAmount, updatedAt=excluded.updatedAt`,
          [id, storeId, month, year, b.category, Number(b.budgetAmount), t, t],
        )
        return ok({ id }, 201)
      }

      if (segs[1] && method === 'PATCH') {
        const b = (await req.json()) as any
        if (b.budgetAmount === undefined) return err('budgetAmount is required', 400)
        await exec(`UPDATE Budget SET budgetAmount=?, updatedAt=? WHERE id=? AND storeId=?`, [
          Number(b.budgetAmount),
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }

      if (segs[1] && method === 'DELETE') {
        await exec(`DELETE FROM Budget WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ─── REPORTS / CASHFLOW ───────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'cashflow' && method === 'GET') {
      const months = Math.min(6, Math.max(1, parseInt(sp.get('months') ?? '3')))

      // Revenue: last 3 months grouped by month
      const revenueRows = (await query(
        `SELECT strftime('%Y-%m', createdAt) as ym, SUM(total) as revenue
           FROM "Order"
          WHERE storeId=? AND status='PAID'
            AND createdAt >= date('now', '-3 months')
          GROUP BY ym
          ORDER BY ym`,
        [storeId],
      )) as any[]

      // Expenses: last 3 months grouped by month
      const expenseRows = (await query(
        `SELECT strftime('%Y-%m', date) as ym, SUM(amount) as expenses
           FROM Expense
          WHERE storeId=? AND date >= date('now', '-3 months')
          GROUP BY ym
          ORDER BY ym`,
        [storeId],
      )) as any[]

      const revenueValues = revenueRows.map((r: any) => Number(r.revenue))
      const expenseValues = expenseRows.map((r: any) => Number(r.expenses))

      const avgRevenue =
        revenueValues.length > 0
          ? revenueValues.reduce((a, b) => a + b, 0) / revenueValues.length
          : 0
      const avgExpenses =
        expenseValues.length > 0
          ? expenseValues.reduce((a, b) => a + b, 0) / expenseValues.length
          : 0

      // Build projections for next `months` months
      const now2 = new Date()
      const projections = Array.from({ length: months }, (_, i) => {
        const d = new Date(now2.getFullYear(), now2.getMonth() + i + 1, 1)
        const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
        return {
          month: label,
          projectedIncome: Math.max(0, avgRevenue),
          projectedExpenses: Math.max(0, avgExpenses),
          projectedNet: avgRevenue - avgExpenses,
        }
      })

      return ok({ projections, avgRevenue, avgExpenses })
    }

    // ─── REPORTS / CHURN ─────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'churn') {
      // POST: log re-engagement outreach in AuditLog
      if (method === 'POST') {
        const b: any = await req.json()
        validateRequired(b, ['customerId', 'customerName'])
        await logAudit({
          storeId,
          userId: user.id,
          action: 'UPDATE',
          resourceType: 'Customer',
          resourceId: b.customerId,
          meta: { action: 'reengagement_sent', customerName: b.customerName },
        })
        return ok({ success: true })
      }

      // GET: return all customers with churn score
      if (method === 'GET') {
        // Pull all customers for this store
        const customers = (await query(
          `SELECT id, name, phone, email FROM Customer WHERE storeId = ?`,
          [storeId],
        )) as any[]

        if (customers.length === 0) return ok([])

        const now = Date.now()

        // Per-customer aggregates: total orders, last order, and orders split by time window
        const stats = (await query(
          `SELECT
             customerId,
             COUNT(*) AS total_orders,
             MAX(createdAt) AS last_order_at,
             SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS recent_orders,
             SUM(CASE WHEN createdAt < ? AND createdAt >= ? THEN 1 ELSE 0 END) AS older_orders,
             AVG(CASE WHEN createdAt >= ? THEN total ELSE NULL END) AS recent_avg_value,
             AVG(CASE WHEN createdAt < ? AND createdAt >= ? THEN total ELSE NULL END) AS older_avg_value
           FROM "Order"
           WHERE storeId = ? AND status = 'PAID' AND customerId IS NOT NULL
           GROUP BY customerId`,
          [
            new Date(now - 86400000 * 30).toISOString(), // recent window start
            new Date(now - 86400000 * 30).toISOString(), // older window boundary
            new Date(now - 86400000 * 90).toISOString(), // older window start
            new Date(now - 86400000 * 30).toISOString(), // recent avg start
            new Date(now - 86400000 * 30).toISOString(), // older avg boundary
            new Date(now - 86400000 * 90).toISOString(), // older avg start
            storeId,
          ],
        )) as any[]

        const statsMap = new Map<string, any>()
        for (const r of stats) {
          statsMap.set(r.customerId, r)
        }

        const result = customers.map((c: any) => {
          const s = statsMap.get(c.id)

          const lastOrderAt: string | null = s?.last_order_at ?? null
          const daysSince = lastOrderAt
            ? Math.floor((now - new Date(lastOrderAt).getTime()) / 86400000)
            : 9999
          const purchaseCount = s ? Number(s.total_orders) : 0

          // Frequency trend: ratio of recent rate to older rate (clamped 0-1)
          const recentOrders = s ? Number(s.recent_orders) : 0
          const olderOrders = s ? Number(s.older_orders) : 0
          const recentRate = recentOrders / 30
          const olderRate = olderOrders / 60
          const frequencyTrend =
            olderRate === 0 ? (recentRate > 0 ? 1 : 0.5) : Math.min(1, recentRate / olderRate)

          // Value trend negative: how much avg order value dropped
          const recentAvg = s ? Number(s.recent_avg_value ?? 0) : 0
          const olderAvg = s ? Number(s.older_avg_value ?? 0) : 0
          const valueTrendNeg =
            olderAvg > 0 ? Math.min(1, Math.max(0, (olderAvg - recentAvg) / olderAvg)) : 0

          // score = (recency/90 * 40) + ((1 - freq_trend) * 30) + (value_neg * 30), cap 100
          const recencyComponent = Math.min(1, daysSince / 90) * 40
          const frequencyComponent = (1 - Math.min(1, Math.max(0, frequencyTrend))) * 30
          const valueComponent = Math.min(1, Math.max(0, valueTrendNeg)) * 30
          const churn_score = Math.min(
            100,
            Math.round(recencyComponent + frequencyComponent + valueComponent),
          )

          const risk_level: 'LOW' | 'MEDIUM' | 'HIGH' =
            churn_score >= 70 ? 'HIGH' : churn_score >= 40 ? 'MEDIUM' : 'LOW'

          const recommended_action =
            risk_level === 'HIGH'
              ? daysSince > 60
                ? 'Kirim penawaran eksklusif segera'
                : 'Hubungi via WhatsApp dengan promo khusus'
              : risk_level === 'MEDIUM'
                ? 'Ingatkan dengan diskon atau loyalitas poin'
                : 'Pertahankan dengan program loyalitas'

          return {
            id: c.id,
            name: c.name,
            phone: c.phone ?? null,
            email: c.email ?? null,
            churn_score,
            risk_level,
            days_since_purchase: Math.min(daysSince, 9999),
            purchase_count: purchaseCount,
            last_purchase_at: lastOrderAt,
            recommended_action,
          }
        })

        // Sort by churn_score descending
        result.sort((a: any, b: any) => b.churn_score - a.churn_score)

        return okCached(result, 'private, max-age=60')
      }
    }

    // ─── REPORTS / PRODUCTS ───────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'products' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 30).toISOString()
      const to = sp.get('to') ?? new Date().toISOString()

      // Aggregate OrderItems → product totals for the period
      const rows = (await query(
        `SELECT
          oi.productId,
          MAX(oi.name)                          AS name,
          COALESCE(SUM(oi.subtotal), 0)         AS totalRevenue,
          COALESCE(SUM(oi.qty), 0)              AS qtySold,
          COALESCE(AVG(p.stock), 0)             AS avgStock
        FROM OrderItem oi
        JOIN "Order" o  ON oi.orderId  = o.id
        LEFT JOIN Product p ON oi.productId = p.id
        WHERE o.storeId = ? AND o.status = 'PAID'
          AND o.createdAt BETWEEN ? AND ?
        GROUP BY oi.productId
        ORDER BY totalRevenue DESC`,
        [storeId, from, to],
      )) as any[]

      // Also fetch products with 0 sales (slow movers) in the same period
      const allProducts = (await query(
        `SELECT id AS productId, name, stock AS avgStock
         FROM Product
         WHERE storeId = ? AND active = 1`,
        [storeId],
      )) as any[]

      // Merge: products not in rows get qtySold=0 / totalRevenue=0
      const soldIds = new Set(rows.map((r: any) => r.productId))
      const zeroRows = allProducts
        .filter((p: any) => !soldIds.has(p.productId))
        .map((p: any) => ({
          productId: p.productId,
          name: p.name,
          totalRevenue: 0,
          qtySold: 0,
          avgStock: Number(p.avgStock ?? 0),
        }))

      const combined: any[] = [
        ...rows.map((r: any) => ({
          productId: r.productId,
          name: r.name,
          totalRevenue: Number(r.totalRevenue),
          qtySold: Number(r.qtySold),
          avgStock: Number(r.avgStock ?? 0),
        })),
        ...zeroRows,
      ]

      const grandTotal = combined.reduce((s: number, r: any) => s + r.totalRevenue, 0)

      // ABC classification: sort DESC by revenue, assign classes by cumulative %
      combined.sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
      let cumulative = 0
      const result = combined.map((r: any) => {
        cumulative += r.totalRevenue
        const pct = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 100
        const abcClass: 'A' | 'B' | 'C' = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C'
        const percentOfTotal =
          grandTotal > 0 ? Math.round((r.totalRevenue / grandTotal) * 10000) / 100 : 0
        const turnoverRate = r.avgStock > 0 ? Math.round((r.qtySold / r.avgStock) * 100) / 100 : 0
        return {
          productId: r.productId,
          name: r.name,
          totalRevenue: r.totalRevenue,
          qtySold: r.qtySold,
          percentOfTotal,
          abcClass,
          avgStock: r.avgStock,
          turnoverRate,
        }
      })

      return okCached(result, 'private, max-age=30')
    }

    // ─── HR / PAYROLL ─────────────────────────────────────────────────────────
    // Tables created lazily on first access
    if (segs[0] === 'hr' && segs[1] === 'payroll') {
      await exec(
        `CREATE TABLE IF NOT EXISTS PayrollRecord (
        id            TEXT PRIMARY KEY,
        storeId       TEXT NOT NULL,
        employeeId    TEXT NOT NULL,
        month         INTEGER NOT NULL,
        year          INTEGER NOT NULL,
        baseSalary    REAL NOT NULL DEFAULT 0,
        commission    REAL NOT NULL DEFAULT 0,
        lateDeduction REAL NOT NULL DEFAULT 0,
        leaveDeduction REAL NOT NULL DEFAULT 0,
        otherDeductions REAL NOT NULL DEFAULT 0,
        totalDeductions REAL NOT NULL DEFAULT 0,
        netPay        REAL NOT NULL DEFAULT 0,
        lateDays      INTEGER NOT NULL DEFAULT 0,
        unpaidLeaveDays INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'DRAFT',
        note          TEXT,
        generatedAt   TEXT,
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL
      )`,
        [],
      )

      // GET /api/hr/payroll?storeId=&month=&year=
      if (method === 'GET') {
        const month = parseInt(sp.get('month') ?? '0')
        const year = parseInt(sp.get('year') ?? '0')
        if (!month || !year) return err('month and year required')
        const rows = await query<any>(
          `SELECT pr.*, e.name as employeeName, e.position, e.baseSalary as empBaseSalary
           FROM PayrollRecord pr
           JOIN Employee e ON pr.employeeId = e.id
           WHERE pr.storeId=? AND pr.month=? AND pr.year=?
           ORDER BY e.name`,
          [storeId, month, year],
        )
        return ok(rows)
      }

      // POST /api/hr/payroll/generate { storeId, month, year }
      if (method === 'POST' && segs[2] === 'generate') {
        const b = (await req.json()) as any
        const month = parseInt(b.month ?? '0')
        const year = parseInt(b.year ?? '0')
        if (!month || month < 1 || month > 12) return err('month must be 1-12')
        if (!year || year < 2000) return err('year invalid')

        const LATE_DEDUCTION_PER_DAY = 50_000 // Rp 50K per late day

        const employees = await query<any>(
          `SELECT * FROM Employee WHERE storeId=? AND active=1 AND employmentStatus='ACTIVE'`,
          [storeId],
        )
        if (!employees.length) return err('Tidak ada karyawan aktif')

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
        const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10)

        // Delete existing draft records for this period before regenerating
        await exec(
          `DELETE FROM PayrollRecord WHERE storeId=? AND month=? AND year=? AND status='DRAFT'`,
          [storeId, month, year],
        )

        const t = nowISO()
        const results: any[] = []

        for (const emp of employees) {
          // Count late days
          const [lateRow] = await query<any>(
            `SELECT COUNT(*) as cnt FROM Attendance
             WHERE storeId=? AND employeeId=? AND status='LATE'
             AND date >= ? AND date <= ?`,
            [storeId, emp.id, periodStart, periodEnd],
          )
          const lateDays = Number(lateRow?.cnt ?? 0)
          const lateDeduction = lateDays * LATE_DEDUCTION_PER_DAY

          // Count unpaid leave days (PERSONAL type leaves that are APPROVED)
          const [leaveRow] = await query<any>(
            `SELECT COALESCE(SUM(
               (julianday(MIN(endDate, ?)) - julianday(MAX(startDate, ?)) + 1)
             ), 0) as days
             FROM LeaveRequest
             WHERE storeId=? AND employeeId=? AND type='PERSONAL' AND status='APPROVED'
             AND startDate <= ? AND endDate >= ?`,
            [periodEnd, periodStart, storeId, emp.id, periodEnd, periodStart],
          )
          const unpaidLeaveDays = Math.max(0, Math.round(Number(leaveRow?.days ?? 0)))
          const dailySalary = Math.round((emp.baseSalary ?? 0) / 26)
          const leaveDeduction = unpaidLeaveDays * dailySalary

          // Commission from sales in this period
          const [commRow] = await query<any>(
            `SELECT COALESCE(SUM(o.total * e.commissionRate / 100), 0) as commission
             FROM "Order" o
             JOIN Employee e ON e.id=?
             WHERE o.storeId=? AND o.staffId=e.userId AND o.status='PAID'
             AND o.createdAt >= ? AND o.createdAt < ?`,
            [emp.id, storeId, periodStart + 'T00:00:00Z', periodEnd + 'T23:59:59Z'],
          )
          const commission = Math.round(Number(commRow?.commission ?? 0))

          const totalDeductions = lateDeduction + leaveDeduction
          const netPay = Math.max(0, (emp.baseSalary ?? 0) + commission - totalDeductions)

          const recId = newId()
          await exec(
            `INSERT INTO PayrollRecord
               (id,storeId,employeeId,month,year,baseSalary,commission,
                lateDeduction,leaveDeduction,otherDeductions,totalDeductions,
                netPay,lateDays,unpaidLeaveDays,status,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?)`,
            [
              recId,
              storeId,
              emp.id,
              month,
              year,
              emp.baseSalary ?? 0,
              commission,
              lateDeduction,
              leaveDeduction,
              0,
              totalDeductions,
              netPay,
              lateDays,
              unpaidLeaveDays,
              t,
              t,
            ],
          )
          results.push({
            id: recId,
            employeeId: emp.id,
            employeeName: emp.name,
            baseSalary: emp.baseSalary ?? 0,
            commission,
            lateDeduction,
            leaveDeduction,
            totalDeductions,
            netPay,
            lateDays,
            unpaidLeaveDays,
          })
        }

        return ok({ month, year, records: results, count: results.length }, 201)
      }
    }

    // ─── HR / REVIEWS (Performance Reviews) ──────────────────────────────────
    if (segs[0] === 'hr' && segs[1] === 'reviews') {
      await exec(
        `CREATE TABLE IF NOT EXISTS PerformanceReview (
        id           TEXT PRIMARY KEY,
        storeId      TEXT NOT NULL,
        employeeId   TEXT NOT NULL,
        reviewerId   TEXT,
        reviewerName TEXT,
        score        INTEGER NOT NULL DEFAULT 3,
        strengths    TEXT,
        improvements TEXT,
        goals        TEXT,
        notes        TEXT,
        reviewDate   TEXT NOT NULL,
        createdAt    TEXT NOT NULL,
        updatedAt    TEXT NOT NULL
      )`,
        [],
      )

      // GET /api/hr/reviews?storeId=&employeeId=&month=&year=
      if (method === 'GET') {
        const employeeId = sp.get('employeeId')
        const month = sp.get('month')
        const year = sp.get('year')
        let q = `SELECT pr.*, e.name as employeeName, e.position
                 FROM PerformanceReview pr
                 JOIN Employee e ON pr.employeeId = e.id
                 WHERE pr.storeId=?`
        const params: any[] = [storeId]
        if (employeeId) {
          q += ` AND pr.employeeId=?`
          params.push(employeeId)
        }
        if (year && month) {
          q += ` AND strftime('%Y-%m', pr.reviewDate)=?`
          params.push(`${year}-${String(month).padStart(2, '0')}`)
        } else if (year) {
          q += ` AND strftime('%Y', pr.reviewDate)=?`
          params.push(year)
        }
        q += ` ORDER BY pr.reviewDate DESC`
        return ok(await query(q, params))
      }

      // POST /api/hr/reviews
      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.employeeId) return err('employeeId wajib diisi')
        if (!b.reviewDate) return err('reviewDate wajib diisi')
        const score = parseInt(b.score ?? '3')
        if (score < 1 || score > 5) return err('score harus antara 1-5')

        const emp = await queryOne<any>(`SELECT id, name FROM Employee WHERE id=? AND storeId=?`, [
          b.employeeId,
          storeId,
        ])
        if (!emp) return err('Karyawan tidak ditemukan', 404)

        const t = nowISO()
        const rid = newId()
        await exec(
          `INSERT INTO PerformanceReview
             (id,storeId,employeeId,reviewerId,reviewerName,score,
              strengths,improvements,goals,notes,reviewDate,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            rid,
            storeId,
            b.employeeId,
            user.id ?? null,
            user.name ?? null,
            score,
            b.strengths ?? null,
            b.improvements ?? null,
            b.goals ?? null,
            b.notes ?? null,
            b.reviewDate,
            t,
            t,
          ],
        )
        return ok({ id: rid, employeeName: emp.name, score }, 201)
      }
    }

    // ─── HR / COMMISSION RULES ────────────────────────────────────────────────
    if (segs[0] === 'hr' && segs[1] === 'commission-rules') {
      await exec(
        `CREATE TABLE IF NOT EXISTS CommissionRule (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          employeeId TEXT,
          type TEXT NOT NULL DEFAULT 'PERCENTAGE',
          value REAL NOT NULL DEFAULT 0,
          tiers TEXT,
          effectiveFrom TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )`,
        [],
      )

      // GET /api/hr/commission-rules?storeId=
      if (method === 'GET') {
        const rows = await query<any>(
          `SELECT cr.*, e.name as employeeName
           FROM CommissionRule cr
           LEFT JOIN Employee e ON cr.employeeId = e.id
           WHERE cr.storeId = ?
           ORDER BY cr.effectiveFrom DESC`,
          [storeId],
        )
        return ok(rows)
      }

      // POST /api/hr/commission-rules — create rule
      if (method === 'POST') {
        const b = (await req.json()) as any
        if (!b.type || !['PERCENTAGE', 'FLAT', 'TIERED'].includes(b.type))
          return err('type must be PERCENTAGE, FLAT, or TIERED')
        if (!b.effectiveFrom) return err('effectiveFrom required')
        const t = nowISO()
        const rid = newId()
        await exec(
          `INSERT INTO CommissionRule (id,storeId,employeeId,type,value,tiers,effectiveFrom,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            rid,
            storeId,
            b.employeeId ?? null,
            b.type,
            Number(b.value) || 0,
            b.tiers ? JSON.stringify(b.tiers) : null,
            b.effectiveFrom,
            t,
            t,
          ],
        )
        return ok({ id: rid }, 201)
      }

      // PATCH /api/hr/commission-rules?id= — update rule
      if (method === 'PATCH') {
        const ruleId = sp.get('id')
        if (!ruleId) return err('id required')
        const b = (await req.json()) as any
        const t = nowISO()
        await exec(
          `UPDATE CommissionRule SET
             employeeId=?, type=?, value=?, tiers=?, effectiveFrom=?, updatedAt=?
           WHERE id=? AND storeId=?`,
          [
            b.employeeId ?? null,
            b.type,
            Number(b.value) || 0,
            b.tiers ? JSON.stringify(b.tiers) : null,
            b.effectiveFrom,
            t,
            ruleId,
            storeId,
          ],
        )
        return ok({ success: true })
      }

      // DELETE /api/hr/commission-rules?id=
      if (method === 'DELETE') {
        const ruleId = sp.get('id')
        if (!ruleId) return err('id required')
        await exec(`DELETE FROM CommissionRule WHERE id=? AND storeId=?`, [ruleId, storeId])
        return ok({ success: true })
      }
    }

    // ─── HR / COMMISSION (summary + calculate) ────────────────────────────────
    if (segs[0] === 'hr' && segs[1] === 'commission') {
      // Ensure tables exist
      await exec(
        `CREATE TABLE IF NOT EXISTS CommissionRule (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          employeeId TEXT,
          type TEXT NOT NULL DEFAULT 'PERCENTAGE',
          value REAL NOT NULL DEFAULT 0,
          tiers TEXT,
          effectiveFrom TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )`,
        [],
      )
      await exec(
        `CREATE TABLE IF NOT EXISTS CommissionSummary (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          employeeId TEXT NOT NULL,
          month INTEGER NOT NULL,
          year INTEGER NOT NULL,
          ordersClosed INTEGER NOT NULL DEFAULT 0,
          totalSales REAL NOT NULL DEFAULT 0,
          commissionEarned REAL NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          UNIQUE(storeId, employeeId, month, year)
        )`,
        [],
      )

      // Helper: calculate commission for an employee given their total sales
      function calcCommissionAmount(
        totalSales: number,
        orderCount: number,
        rule: { type: string; value: number; tiers: string | null },
      ): number {
        if (rule.type === 'PERCENTAGE') {
          return Math.round((totalSales * rule.value) / 100)
        }
        if (rule.type === 'FLAT') {
          return Math.round(rule.value * orderCount)
        }
        if (rule.type === 'TIERED' && rule.tiers) {
          const tiers: Array<{ upTo: number | null; rate: number }> =
            typeof rule.tiers === 'string' ? JSON.parse(rule.tiers) : rule.tiers
          let remaining = totalSales
          let commission = 0
          let prevThreshold = 0
          for (const tier of tiers) {
            if (remaining <= 0) break
            const ceiling = tier.upTo === null ? Infinity : tier.upTo
            const band = Math.min(remaining, ceiling - prevThreshold)
            if (band > 0) {
              commission += (band * tier.rate) / 100
              remaining -= band
            }
            if (tier.upTo !== null) prevThreshold = tier.upTo
          }
          return Math.round(commission)
        }
        return 0
      }

      // GET /api/hr/commission?storeId=&month=&year=
      if (method === 'GET' && !segs[2]) {
        const month = parseInt(sp.get('month') ?? '0')
        const year = parseInt(sp.get('year') ?? '0')
        if (!month || !year) return err('month and year required')
        const rows = await query<any>(
          `SELECT cs.*, e.name as employeeName, e.position
           FROM CommissionSummary cs
           JOIN Employee e ON cs.employeeId = e.id
           WHERE cs.storeId=? AND cs.month=? AND cs.year=?
           ORDER BY cs.totalSales DESC`,
          [storeId, month, year],
        )
        return ok(rows)
      }

      // POST /api/hr/commission/calculate — calculate & persist commission summaries
      if (method === 'POST' && segs[2] === 'calculate') {
        const b = (await req.json()) as any
        const month = parseInt(b.month ?? '0')
        const year = parseInt(b.year ?? '0')
        if (!month || month < 1 || month > 12) return err('month must be 1-12')
        if (!year || year < 2000) return err('year invalid')

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
        const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10)

        const employees = await query<any>(
          `SELECT * FROM Employee WHERE storeId=? AND active=1 AND employmentStatus='ACTIVE'`,
          [storeId],
        )
        if (!employees.length) return err('Tidak ada karyawan aktif')

        // Fetch all active rules for this store ordered by specificity (employee-specific first)
        const rules = await query<any>(
          `SELECT * FROM CommissionRule
           WHERE storeId=? AND effectiveFrom <= ?
           ORDER BY employeeId IS NULL ASC, effectiveFrom DESC`,
          [storeId, periodEnd],
        )

        const t = nowISO()
        const results: any[] = []

        for (const emp of employees) {
          // Find the applicable rule: employee-specific first, then store-wide
          const rule =
            (rules as any[]).find(r => r.employeeId === emp.id) ??
            (rules as any[]).find(r => r.employeeId === null) ??
            null

          // Aggregate orders for this employee in the period
          const [salesRow] = await query<any>(
            `SELECT COUNT(*) as orderCount, COALESCE(SUM(o.total),0) as totalSales
             FROM "Order" o
             WHERE o.storeId=? AND o.userId=? AND o.status='PAID'
               AND o.createdAt >= ? AND o.createdAt <= ?`,
            [storeId, emp.userId, periodStart + 'T00:00:00.000Z', periodEnd + 'T23:59:59.999Z'],
          )

          const ordersClosed = Number(salesRow?.orderCount ?? 0)
          const totalSales = Number(salesRow?.totalSales ?? 0)
          const commissionEarned = rule
            ? calcCommissionAmount(totalSales, ordersClosed, rule)
            : 0

          // Upsert
          await exec(
            `INSERT INTO CommissionSummary
               (id,storeId,employeeId,month,year,ordersClosed,totalSales,commissionEarned,createdAt,updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(storeId,employeeId,month,year) DO UPDATE SET
               ordersClosed=excluded.ordersClosed,
               totalSales=excluded.totalSales,
               commissionEarned=excluded.commissionEarned,
               updatedAt=excluded.updatedAt`,
            [newId(), storeId, emp.id, month, year, ordersClosed, totalSales, commissionEarned, t, t],
          )

          results.push({
            employeeId: emp.id,
            employeeName: emp.name,
            ordersClosed,
            totalSales,
            commissionEarned,
          })
        }

        return ok({ month, year, count: results.length, data: results }, 201)
      }
    }

    // ─── ACTIVITY FEED ────────────────────────────────────────────────────────
    if (segs[0] === 'activity') {
      if (method === 'GET') {
        // Ensure AuditLog table exists (idempotent)
        await exec(
          `CREATE TABLE IF NOT EXISTS AuditLog (
            id TEXT PRIMARY KEY,
            storeId TEXT NOT NULL,
            userId TEXT NOT NULL,
            action TEXT NOT NULL,
            resourceType TEXT,
            resourceId TEXT,
            meta TEXT,
            createdAt TEXT NOT NULL
          )`,
          [],
        )
        const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
        const rows = await query<any>(
          `SELECT al.id, al.action, al.resourceType as resource, al.userId, u.name as userName, al.createdAt
           FROM AuditLog al
           LEFT JOIN User u ON al.userId = u.id
           WHERE al.storeId = ?
           ORDER BY al.createdAt DESC
           LIMIT ?`,
          [storeId, limit],
        )
        return ok(rows)
      }
    }

    // ─── SYSTEM HEALTH ────────────────────────────────────────────────────────
    if (segs[0] === 'system' && segs[1] === 'health') {
      if (method === 'GET') {
        const callerRole = user.stores?.find((s: any) => s.id === storeId)?.role
        if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(callerRole)) return err('Forbidden', 403)

        // Row counts
        const [orderCount] = await query<{ c: number }>(
          `SELECT COUNT(*) as c FROM "Order" WHERE storeId = ?`,
          [storeId],
        )
        const [productCount] = await query<{ c: number }>(
          `SELECT COUNT(*) as c FROM Product WHERE storeId = ?`,
          [storeId],
        )
        const [customerCount] = await query<{ c: number }>(
          `SELECT COUNT(*) as c FROM Customer WHERE storeId = ?`,
          [storeId],
        )
        const [employeeCount] = await query<{ c: number }>(
          `SELECT COUNT(*) as c FROM User u
           JOIN UserStore us ON us.userId = u.id
           WHERE us.storeId = ?`,
          [storeId],
        )

        const orders = orderCount?.c ?? 0
        const products = productCount?.c ?? 0
        const customers = customerCount?.c ?? 0
        const employees = employeeCount?.c ?? 0

        // Storage estimate: assume avg row sizes in bytes
        // Order≈512, Product≈256, Customer≈256, User≈128
        const totalRows = orders + products + customers + employees
        const estimatedBytes = orders * 512 + products * 256 + customers * 256 + employees * 128
        const estimatedKB = Math.round(estimatedBytes / 1024)

        return ok({
          counts: { orders, products, customers, employees },
          storageEstimate: { totalRows, estimatedKB },
        })
      }
    }

    // ─── STOCK OPNAME ─────────────────────────────────────────────────────────
    if (segs[0] === 'stock-opname') {
      // Lazy-create tables
      await exec(`
        CREATE TABLE IF NOT EXISTS StockOpname (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
          startedAt TEXT NOT NULL,
          completedAt TEXT,
          notes TEXT,
          createdAt TEXT NOT NULL
        )
      `)
      await exec(`
        CREATE TABLE IF NOT EXISTS StockOpnameItem (
          id TEXT PRIMARY KEY,
          opnameId TEXT NOT NULL,
          productId TEXT NOT NULL,
          systemQty REAL NOT NULL DEFAULT 0,
          countedQty REAL,
          variance REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (opnameId) REFERENCES StockOpname(id),
          FOREIGN KEY (productId) REFERENCES Product(id)
        )
      `)

      // GET /api/stock-opname?storeId= — list sessions with total variance
      if (segs.length === 1 && method === 'GET') {
        const sessions = await query<any>(
          `SELECT s.*,
                  COUNT(i.id) as itemCount,
                  COALESCE(SUM(i.variance), 0) as totalVariance
           FROM StockOpname s
           LEFT JOIN StockOpnameItem i ON i.opnameId = s.id
           WHERE s.storeId = ?
           GROUP BY s.id
           ORDER BY s.startedAt DESC`,
          [storeId],
        )
        return ok(sessions)
      }

      // POST /api/stock-opname — create new session, snapshot current stock
      if (segs.length === 1 && method === 'POST') {
        const b = (await req.json()) as { storeId?: string; notes?: string }
        const sid = b.storeId ?? storeId
        const sessionId = newId()
        const t = nowISO()

        await exec(
          `INSERT INTO StockOpname (id, storeId, status, startedAt, completedAt, notes, createdAt)
           VALUES (?, ?, 'IN_PROGRESS', ?, NULL, ?, ?)`,
          [sessionId, sid, t, b.notes ?? null, t],
        )

        // Snapshot all trackStock products at current qty
        const products = await query<any>(
          `SELECT id, stock FROM Product WHERE storeId = ? AND trackStock = 1 AND active = 1`,
          [sid],
        )
        for (const p of products) {
          await exec(
            `INSERT INTO StockOpnameItem (id, opnameId, productId, systemQty, countedQty, variance)
             VALUES (?, ?, ?, ?, NULL, 0)`,
            [newId(), sessionId, p.id, p.stock],
          )
        }

        // Return full session with items
        const session = await queryOne<any>(`SELECT * FROM StockOpname WHERE id = ?`, [sessionId])
        const items = await query<any>(
          `SELECT i.*, p.name as productName, p.sku as productSku, p.barcode as productBarcode
           FROM StockOpnameItem i
           JOIN Product p ON p.id = i.productId
           WHERE i.opnameId = ?
           ORDER BY p.name ASC`,
          [sessionId],
        )
        return ok({ ...session, items }, 201)
      }

      // GET /api/stock-opname/:id — get session with items
      if (segs.length === 2 && method === 'GET') {
        const sessionId = segs[1]
        const session = await queryOne<any>(
          `SELECT * FROM StockOpname WHERE id = ? AND storeId = ?`,
          [sessionId, storeId],
        )
        if (!session) return err('Session not found', 404, 'NOT_FOUND')
        const items = await query<any>(
          `SELECT i.*, p.name as productName, p.sku as productSku, p.barcode as productBarcode
           FROM StockOpnameItem i
           JOIN Product p ON p.id = i.productId
           WHERE i.opnameId = ?
           ORDER BY p.name ASC`,
          [sessionId],
        )
        return ok({ ...session, items })
      }

      // PATCH /api/stock-opname/:id — update counts and optionally submit
      if (segs.length === 2 && method === 'PATCH') {
        const sessionId = segs[1]
        const session = await queryOne<any>(
          `SELECT * FROM StockOpname WHERE id = ? AND storeId = ?`,
          [sessionId, storeId],
        )
        if (!session) return err('Session not found', 404, 'NOT_FOUND')
        if (session.status === 'COMPLETED')
          return err('Session already completed', 400, 'ALREADY_COMPLETED')

        const b = (await req.json()) as {
          items?: { productId: string; countedQty: number }[]
          notes?: string
          action?: string
        }

        const t = nowISO()

        // Update counted quantities and variance
        if (b.items && Array.isArray(b.items)) {
          for (const it of b.items) {
            const sysRow = await queryOne<any>(
              `SELECT systemQty FROM StockOpnameItem WHERE opnameId = ? AND productId = ?`,
              [sessionId, it.productId],
            )
            if (!sysRow) continue
            const variance = it.countedQty - sysRow.systemQty
            await exec(
              `UPDATE StockOpnameItem SET countedQty = ?, variance = ?
               WHERE opnameId = ? AND productId = ?`,
              [it.countedQty, variance, sessionId, it.productId],
            )
          }
        }

        // Update notes
        if (b.notes !== undefined) {
          await exec(`UPDATE StockOpname SET notes = ? WHERE id = ?`, [b.notes, sessionId])
        }

        // Submit: mark COMPLETED + apply stock adjustments
        if (b.action === 'submit') {
          // Get all items with variance
          const opnameItems = await query<any>(`SELECT * FROM StockOpnameItem WHERE opnameId = ?`, [
            sessionId,
          ])
          const withVariance = opnameItems.filter(
            (i: any) => i.countedQty !== null && i.variance !== 0,
          )

          for (const item of withVariance) {
            // Adjust product stock
            await exec(
              `UPDATE Product SET stock = stock + ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
              [item.variance, t, item.productId, storeId],
            )
            // Create StockLog entry
            await exec(
              `INSERT INTO StockLog (id, storeId, productId, userId, type, qty, note, createdAt)
               VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?, ?, ?)`,
              [
                newId(),
                storeId,
                item.productId,
                user.id,
                Math.abs(item.variance),
                `Stock opname #${sessionId.slice(-8)}`,
                t,
              ],
            )
          }

          await exec(`UPDATE StockOpname SET status = 'COMPLETED', completedAt = ? WHERE id = ?`, [
            t,
            sessionId,
          ])

          logAudit({
            storeId,
            userId: user.id,
            action: 'STOCK_OPNAME_COMPLETE',
            resourceType: 'StockOpname',
            resourceId: sessionId,
            meta: { itemsAdjusted: withVariance.length },
          }).catch(() => {})
        }

        // Return updated session with items
        const updated = await queryOne<any>(`SELECT * FROM StockOpname WHERE id = ?`, [sessionId])
        const items = await query<any>(
          `SELECT i.*, p.name as productName, p.sku as productSku, p.barcode as productBarcode
           FROM StockOpnameItem i
           JOIN Product p ON p.id = i.productId
           WHERE i.opnameId = ?
           ORDER BY p.name ASC`,
          [sessionId],
        )
        return ok({ ...updated, items })
      }
    }

    // ── accounting/reconciliation ─────────────────────────────────────────────
    // GET  /api/accounting/reconciliation?storeId=&from=&to=
    //      → returns unmatched system transactions for the date range
    // POST /api/accounting/reconciliation?storeId=
    //      body: { bankId, systemId }  → creates a reconciliation match record
    if (segs[0] === 'accounting' && segs[1] === 'reconciliation') {
      // Lazy-create BankStatement table if it doesn't exist yet
      await exec(
        `
        CREATE TABLE IF NOT EXISTS BankStatement (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          date TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('CREDIT','DEBIT')),
          matchedId TEXT,
          status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK(status IN ('UNMATCHED','MATCHED','IGNORED')),
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `,
        [],
      )

      // Lazy-create ReconciliationMatch table
      await exec(
        `
        CREATE TABLE IF NOT EXISTS ReconciliationMatch (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          bankStatementId TEXT NOT NULL,
          systemTransactionId TEXT NOT NULL,
          systemTransactionType TEXT NOT NULL,
          matchedAt TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `,
        [],
      )

      if (method === 'GET') {
        const from =
          sp.get('from') ??
          new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        const to = sp.get('to') ?? new Date().toISOString().slice(0, 10)

        // Collect unmatched system transactions from Orders (PAID) and JournalEntries
        const orders = await query<any>(
          `SELECT id, createdAt as date, 'Order #' || id as description, total as amount, 'CREDIT' as type,
                  NULL as matchedId, 'UNMATCHED' as status, 'order' as sourceType
           FROM "Order"
           WHERE storeId = ? AND status = 'PAID'
             AND date(createdAt) BETWEEN ? AND ?
           ORDER BY createdAt DESC
           LIMIT 200`,
          [storeId, from, to],
        )

        const expenses = await query<any>(
          `SELECT id, date, COALESCE(description, category) as description, amount,
                  'DEBIT' as type, NULL as matchedId, 'UNMATCHED' as status, 'expense' as sourceType
           FROM Expense
           WHERE storeId = ? AND date BETWEEN ? AND ?
           ORDER BY date DESC
           LIMIT 200`,
          [storeId, from, to],
        )

        // Mark any already-matched ones
        const matchedOrders = await query<any>(
          `SELECT systemTransactionId FROM ReconciliationMatch WHERE storeId = ? AND systemTransactionType = 'order'`,
          [storeId],
        )
        const matchedExpenses = await query<any>(
          `SELECT systemTransactionId FROM ReconciliationMatch WHERE storeId = ? AND systemTransactionType = 'expense'`,
          [storeId],
        )
        const matchedOrderIds = new Set(matchedOrders.map((r: any) => r.systemTransactionId))
        const matchedExpenseIds = new Set(matchedExpenses.map((r: any) => r.systemTransactionId))

        const result = [
          ...orders.map((r: any) => ({
            ...r,
            status: matchedOrderIds.has(r.id) ? 'MATCHED' : 'UNMATCHED',
          })),
          ...expenses.map((r: any) => ({
            ...r,
            status: matchedExpenseIds.has(r.id) ? 'MATCHED' : 'UNMATCHED',
          })),
        ]

        return ok(result)
      }

      if (method === 'POST') {
        const b = (await req.json()) as any
        validateRequired(b, ['bankId', 'systemId'])
        const t = nowISO()
        const matchId = newId()

        // Determine source type from systemId prefix heuristic or just store both
        const systemType = String(b.systemId).startsWith('exp') ? 'expense' : 'order'

        await exec(
          `INSERT OR IGNORE INTO ReconciliationMatch (id, storeId, bankStatementId, systemTransactionId, systemTransactionType, matchedAt, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [matchId, storeId, b.bankId, b.systemId, systemType, t, t],
        )

        return ok({ id: matchId, bankId: b.bankId, systemId: b.systemId, matchedAt: t }, 201)
      }
    }

    // ── Marketing Campaigns ───────────────────────────────────────────────────
    if (segs[0] === 'marketing-campaigns') {
      // Lazy init table
      await exec(`
        CREATE TABLE IF NOT EXISTS MarketingCampaign (
          id           TEXT PRIMARY KEY,
          storeId      TEXT NOT NULL,
          name         TEXT NOT NULL,
          type         TEXT NOT NULL DEFAULT 'EMAIL',
          status       TEXT NOT NULL DEFAULT 'DRAFT',
          message      TEXT NOT NULL DEFAULT '',
          audience     TEXT NOT NULL DEFAULT 'ALL',
          audienceValue TEXT,
          scheduledAt  TEXT,
          sentCount    INTEGER NOT NULL DEFAULT 0,
          createdAt    TEXT NOT NULL,
          updatedAt    TEXT NOT NULL
        )
      `)

      // GET /api/marketing-campaigns?storeId=...
      if (!segs[1] && method === 'GET') {
        const rows = await query(
          `SELECT * FROM MarketingCampaign WHERE storeId=? ORDER BY createdAt DESC`,
          [storeId],
        )
        return ok(rows)
      }

      // POST /api/marketing-campaigns
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        if (!b.name || String(b.name).trim().length < 2) return err('name minimal 2 karakter')
        if (!b.message || String(b.message).trim().length < 1) return err('message required')
        const validTypes = ['EMAIL', 'SMS', 'WHATSAPP']
        const validAudiences = ['ALL', 'SEGMENT', 'LOYALTY_TIER']
        const type = validTypes.includes(b.type) ? b.type : 'EMAIL'
        const audience = validAudiences.includes(b.audience) ? b.audience : 'ALL'
        const id = newId()
        const t = nowISO()
        const status = b.scheduledAt ? 'SCHEDULED' : 'DRAFT'
        await exec(
          `INSERT INTO MarketingCampaign
           (id,storeId,name,type,status,message,audience,audienceValue,scheduledAt,sentCount,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.name.trim(),
            type,
            status,
            b.message.trim(),
            audience,
            b.audienceValue ?? null,
            b.scheduledAt ?? null,
            0,
            t,
            t,
          ],
        )
        return ok({ id, status }, 201)
      }

      // POST /api/marketing-campaigns/send/:id
      if (segs[1] === 'send' && segs[2] && method === 'POST') {
        const campaignId = segs[2]
        const campaign = (await queryOne(
          `SELECT * FROM MarketingCampaign WHERE id=? AND storeId=?`,
          [campaignId, storeId],
        )) as any
        if (!campaign) return err('Campaign not found', 404)

        // Count audience size
        let audienceCount = 0
        if (campaign.audience === 'ALL') {
          const row = (await queryOne(`SELECT COUNT(*) as cnt FROM Customer WHERE storeId=?`, [
            storeId,
          ])) as any
          audienceCount = Number(row?.cnt ?? 0)
        } else if (campaign.audience === 'SEGMENT') {
          // RFM segment — approximate via loyalty members or all customers fallback
          const row = (await queryOne(`SELECT COUNT(*) as cnt FROM Customer WHERE storeId=?`, [
            storeId,
          ])) as any
          audienceCount = Math.max(1, Math.floor(Number(row?.cnt ?? 10) * 0.3))
        } else if (campaign.audience === 'LOYALTY_TIER') {
          const row = (await queryOne(
            `SELECT COUNT(*) as cnt FROM LoyaltyMember WHERE storeId=? AND tierId=?`,
            [storeId, campaign.audienceValue ?? ''],
          )) as any
          audienceCount = Number(row?.cnt ?? 0)
        }
        if (audienceCount === 0) audienceCount = 1 // always send to at least 1

        // Simulate delivery stats
        const deliveryRate = 0.92 + Math.random() * 0.06
        const openRate = 0.18 + Math.random() * 0.22
        const delivered = Math.round(audienceCount * deliveryRate)
        const failed = audienceCount - delivered
        const opened = Math.round(delivered * openRate)

        const t2 = nowISO()
        await exec(
          `UPDATE MarketingCampaign SET status='SENT', sentCount=?, updatedAt=? WHERE id=? AND storeId=?`,
          [audienceCount, t2, campaignId, storeId],
        )

        return ok({
          success: true,
          sentCount: audienceCount,
          stats: { delivered, failed, opened },
        })
      }

      // PATCH /api/marketing-campaigns/:id
      if (segs[1] && segs[1] !== 'send' && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set([
          'name',
          'message',
          'type',
          'status',
          'audience',
          'audienceValue',
          'scheduledAt',
        ])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(
          `UPDATE MarketingCampaign SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`,
          [...values, nowISO(), segs[1], storeId],
        )
        return ok({ success: true })
      }

      // DELETE /api/marketing-campaigns/:id
      if (segs[1] && segs[1] !== 'send' && method === 'DELETE') {
        await exec(`DELETE FROM MarketingCampaign WHERE id=? AND storeId=?`, [segs[1], storeId])
        return ok({ success: true })
      }
    }

    // ── FRANCHISE CONFIG ──────────────────────────────────────────────────────
    if (segs[0] === 'franchise-configs') {
      // Lazy-init FranchiseConfig table
      await exec(`
        CREATE TABLE IF NOT EXISTS FranchiseConfig (
          id            TEXT PRIMARY KEY,
          storeId       TEXT NOT NULL,
          parentStoreId TEXT NOT NULL,
          royaltyRate   REAL NOT NULL DEFAULT 5,
          contractStart TEXT,
          contractEnd   TEXT,
          createdAt     TEXT NOT NULL,
          updatedAt     TEXT NOT NULL
        )
      `)

      // GET /api/franchise-configs?parentStoreId= — list franchise configs
      if (segs.length === 1 && method === 'GET') {
        const parentId = sp.get('parentStoreId') ?? storeId
        const rows = await query(
          `SELECT fc.*, s.name as storeName
             FROM FranchiseConfig fc
             JOIN Store s ON fc.storeId = s.id
            WHERE fc.parentStoreId = ?
            ORDER BY s.name`,
          [parentId],
        )
        return ok(rows)
      }

      // POST /api/franchise-configs — create or update franchise config
      if (segs.length === 1 && method === 'POST') {
        const b = (await req.json()) as any
        validateRequired(b, ['storeId', 'royaltyRate'])
        const now = nowISO()
        const existing = await queryOne(
          `SELECT id FROM FranchiseConfig WHERE storeId = ? AND parentStoreId = ?`,
          [b.storeId, storeId],
        )
        if (existing) {
          await exec(
            `UPDATE FranchiseConfig SET royaltyRate=?, contractStart=?, contractEnd=?, updatedAt=?
              WHERE storeId=? AND parentStoreId=?`,
            [
              b.royaltyRate,
              b.contractStart ?? null,
              b.contractEnd ?? null,
              now,
              b.storeId,
              storeId,
            ],
          )
          return ok({ success: true, updated: true })
        }
        const id = newId()
        await exec(
          `INSERT INTO FranchiseConfig (id, storeId, parentStoreId, royaltyRate, contractStart, contractEnd, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            b.storeId,
            storeId,
            b.royaltyRate,
            b.contractStart ?? null,
            b.contractEnd ?? null,
            now,
            now,
          ],
        )
        return ok({ id, success: true }, 201)
      }

      // POST /api/franchise-configs/royalty-invoice — issue royalty invoice
      if (segs[1] === 'royalty-invoice' && method === 'POST') {
        const b = (await req.json()) as any
        validateRequired(b, ['franchiseStoreId', 'parentStoreId'])

        const config = (await queryOne(
          `SELECT * FROM FranchiseConfig WHERE storeId = ? AND parentStoreId = ?`,
          [b.franchiseStoreId, b.parentStoreId],
        )) as any
        if (!config) return err('Franchise config not found', 404)

        // Sum revenue for the current month
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .slice(0, 10)

        const revRow = (await queryOne(
          `SELECT COALESCE(SUM(totalAmount),0) as revenue
             FROM "Order"
            WHERE storeId = ? AND status = 'COMPLETED'
              AND createdAt >= ? AND createdAt <= ?`,
          [b.franchiseStoreId, monthStart, monthEnd + 'T23:59:59Z'],
        )) as any
        const revenue = Number(revRow?.revenue ?? 0)
        const royaltyFee = revenue * (config.royaltyRate / 100)

        // Create invoice record (reuse Invoice table if it exists, else create)
        await exec(`
          CREATE TABLE IF NOT EXISTS RoyaltyInvoice (
            id              TEXT PRIMARY KEY,
            franchiseStoreId TEXT NOT NULL,
            parentStoreId   TEXT NOT NULL,
            period          TEXT NOT NULL,
            revenue         REAL NOT NULL,
            royaltyRate     REAL NOT NULL,
            royaltyFee      REAL NOT NULL,
            status          TEXT NOT NULL DEFAULT 'UNPAID',
            createdAt       TEXT NOT NULL
          )
        `)
        const invId = newId()
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        await exec(
          `INSERT INTO RoyaltyInvoice (id, franchiseStoreId, parentStoreId, period, revenue, royaltyRate, royaltyFee, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'UNPAID', ?)`,
          [
            invId,
            b.franchiseStoreId,
            b.parentStoreId,
            period,
            revenue,
            config.royaltyRate,
            royaltyFee,
            nowISO(),
          ],
        )
        return ok({ id: invId, period, revenue, royaltyRate: config.royaltyRate, royaltyFee }, 201)
      }
    }

    // ── STOCK TRANSFERS ───────────────────────────────────────────────────────
    if (segs[0] === 'stock-transfers') {
      // Lazy-init StockTransfer table
      await exec(`
        CREATE TABLE IF NOT EXISTS StockTransfer (
          id          TEXT PRIMARY KEY,
          fromStoreId TEXT NOT NULL,
          toStoreId   TEXT NOT NULL,
          productId   TEXT NOT NULL,
          qty         INTEGER NOT NULL,
          status      TEXT NOT NULL DEFAULT 'PENDING',
          requestedAt TEXT NOT NULL,
          completedAt TEXT
        )
      `)

      // GET /api/stock-transfers?storeId= — list transfers involving this store
      if (segs.length === 1 && method === 'GET') {
        const rows = await query(
          `SELECT st.*,
                  fs.name as fromStoreName,
                  ts.name as toStoreName,
                  p.name  as productName
             FROM StockTransfer st
             JOIN Store fs   ON st.fromStoreId = fs.id
             JOIN Store ts   ON st.toStoreId   = ts.id
             JOIN Product p  ON st.productId   = p.id
            WHERE st.fromStoreId = ? OR st.toStoreId = ?
            ORDER BY st.requestedAt DESC
            LIMIT 100`,
          [storeId, storeId],
        )
        return ok(rows)
      }

      // POST /api/stock-transfers — request a transfer
      if (segs.length === 1 && method === 'POST') {
        const b = (await req.json()) as any
        validateRequired(b, ['fromStoreId', 'toStoreId', 'productId', 'qty'])
        validatePositive(b.qty, 'qty')
        if (b.fromStoreId === b.toStoreId) return err('fromStoreId and toStoreId must differ', 400)

        // Check sufficient stock
        const prod = (await queryOne(`SELECT stock FROM Product WHERE id = ? AND storeId = ?`, [
          b.productId,
          b.fromStoreId,
        ])) as any
        if (!prod) return err('Product not found in source store', 404)
        if (prod.stock < b.qty) return err(`Insufficient stock (available: ${prod.stock})`, 400)

        const id = newId()
        await exec(
          `INSERT INTO StockTransfer (id, fromStoreId, toStoreId, productId, qty, status, requestedAt)
           VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
          [id, b.fromStoreId, b.toStoreId, b.productId, b.qty, nowISO()],
        )
        return ok({ id, status: 'PENDING' }, 201)
      }

      // PATCH /api/stock-transfers/:id — approve / reject / complete
      if (segs.length === 2 && method === 'PATCH') {
        const transferId = segs[1]
        const b = (await req.json()) as any
        validateRequired(b, ['status'])

        const allowed = new Set(['APPROVED', 'REJECTED', 'COMPLETED'])
        if (!allowed.has(b.status)) return err('Invalid status', 400)

        const transfer = (await queryOne(`SELECT * FROM StockTransfer WHERE id = ?`, [
          transferId,
        ])) as any
        if (!transfer) return err('Transfer not found', 404)
        if (transfer.status !== 'PENDING' && b.status !== 'COMPLETED') {
          return err('Only PENDING transfers can be approved/rejected', 400)
        }

        const now2 = nowISO()

        if (b.status === 'APPROVED') {
          await exec(`UPDATE StockTransfer SET status='APPROVED' WHERE id=?`, [transferId])
        } else if (b.status === 'REJECTED') {
          await exec(`UPDATE StockTransfer SET status='REJECTED', completedAt=? WHERE id=?`, [
            now2,
            transferId,
          ])
        } else if (b.status === 'COMPLETED') {
          if (transfer.status !== 'APPROVED')
            return err('Transfer must be APPROVED before completing', 400)
          // Deduct from source, add to destination
          await exec(
            `UPDATE Product SET stock = stock - ? WHERE id = ? AND storeId = ? AND stock >= ?`,
            [transfer.qty, transfer.productId, transfer.fromStoreId, transfer.qty],
          )
          // Add to destination (upsert stock)
          const destProd = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [
            transfer.productId,
            transfer.toStoreId,
          ])
          if (destProd) {
            await exec(`UPDATE Product SET stock = stock + ? WHERE id = ? AND storeId = ?`, [
              transfer.qty,
              transfer.productId,
              transfer.toStoreId,
            ])
          }
          await exec(`UPDATE StockTransfer SET status='COMPLETED', completedAt=? WHERE id=?`, [
            now2,
            transferId,
          ])
        }

        return ok({ success: true, status: b.status })
      }
    }

    // ── CONSOLIDATED REPORT ───────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'consolidated' && method === 'GET') {
      const parentStoreId = sp.get('parentStoreId') ?? storeId

      // Ensure FranchiseConfig table exists
      await exec(`
        CREATE TABLE IF NOT EXISTS FranchiseConfig (
          id            TEXT PRIMARY KEY,
          storeId       TEXT NOT NULL,
          parentStoreId TEXT NOT NULL,
          royaltyRate   REAL NOT NULL DEFAULT 5,
          contractStart TEXT,
          contractEnd   TEXT,
          createdAt     TEXT NOT NULL,
          updatedAt     TEXT NOT NULL
        )
      `)

      // Get all child store IDs (including the parent itself)
      const childConfigs = (await query(
        `SELECT fc.storeId, fc.royaltyRate, fc.contractEnd, s.name
           FROM FranchiseConfig fc
           JOIN Store s ON fc.storeId = s.id
          WHERE fc.parentStoreId = ?`,
        [parentStoreId],
      )) as any[]

      // Build storeId list: parent + all children
      const allStoreIds = [parentStoreId, ...childConfigs.map((c: any) => c.storeId)]
      const configMap = new Map(childConfigs.map((c: any) => [c.storeId, c]))

      if (allStoreIds.length === 0) {
        return ok({
          totalRevenue: 0,
          totalOrders: 0,
          totalExpenses: 0,
          netProfit: 0,
          locations: [],
        })
      }

      const placeholders = allStoreIds.map(() => '?').join(',')

      // Sum revenue and orders per store
      const revenueRows = (await query(
        `SELECT storeId,
                COALESCE(SUM(totalAmount), 0) as revenue,
                COUNT(*) as orders
           FROM "Order"
          WHERE storeId IN (${placeholders}) AND status = 'COMPLETED'
          GROUP BY storeId`,
        allStoreIds,
      )) as any[]

      // Sum expenses per store
      const expenseRows = (await query(
        `SELECT storeId, COALESCE(SUM(amount), 0) as expenses
           FROM Expense
          WHERE storeId IN (${placeholders})
          GROUP BY storeId`,
        allStoreIds,
      )) as any[]

      // Staff count per store
      const staffRows = (await query(
        `SELECT storeId, COUNT(*) as staffCount
           FROM Staff
          WHERE storeId IN (${placeholders}) AND active = 1
          GROUP BY storeId`,
        allStoreIds,
      )) as any[]

      const revenueMap = new Map(revenueRows.map((r: any) => [r.storeId, r]))
      const expenseMap = new Map(expenseRows.map((r: any) => [r.storeId, r]))
      const staffMap = new Map(staffRows.map((r: any) => [r.storeId, r]))

      // Fetch store names for parent + children
      const storeNames = (await query(
        `SELECT id, name FROM Store WHERE id IN (${placeholders})`,
        allStoreIds,
      )) as any[]
      const nameMap = new Map(storeNames.map((s: any) => [s.id, s.name]))

      let totalRevenue = 0
      let totalOrders = 0
      let totalExpenses = 0

      const locations = allStoreIds.map(sid => {
        const rev = revenueMap.get(sid)
        const exp = expenseMap.get(sid)
        const stf = staffMap.get(sid)
        const cfg = configMap.get(sid)
        const revenue = Number(rev?.revenue ?? 0)
        const orders = Number(rev?.orders ?? 0)
        const expenses = Number(exp?.expenses ?? 0)
        totalRevenue += revenue
        totalOrders += orders
        totalExpenses += expenses
        return {
          id: sid,
          name: nameMap.get(sid) ?? cfg?.name ?? sid,
          revenue,
          orders,
          expenses,
          staffCount: Number(stf?.staffCount ?? 0),
          royaltyRate: Number(cfg?.royaltyRate ?? 0),
          contractEnd: cfg?.contractEnd ?? null,
        }
      })

      return ok({
        totalRevenue,
        totalOrders,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        locations,
      })
    }

    // ─── INVOICES ─────────────────────────────────────────────────────────────
    if (segs[0] === 'invoices') {
      // Lazy schema creation
      await exec(
        `CREATE TABLE IF NOT EXISTS Invoice (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        customerId TEXT NOT NULL,
        number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        issueDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        terms TEXT NOT NULL DEFAULT 'NET30',
        notes TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        taxAmount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
        [],
      )
      await exec(
        `CREATE TABLE IF NOT EXISTS InvoiceItem (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        description TEXT NOT NULL,
        qty REAL NOT NULL DEFAULT 1,
        unitPrice REAL NOT NULL DEFAULT 0,
        taxRate REAL NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      )`,
        [],
      )

      // GET /api/invoices
      if (!segs[1] && method === 'GET') {
        const status = sp.get('status') ?? ''
        const limit = parseInt(sp.get('limit') ?? '50')
        const offset = parseInt(sp.get('offset') ?? '0')
        const conditions: string[] = ['inv.storeId=?']
        const params: any[] = [storeId]
        if (status) {
          conditions.push('inv.status=?')
          params.push(status)
        }
        const where = conditions.join(' AND ')
        const rows = await query(
          `SELECT inv.*, c.name as customerName
           FROM Invoice inv
           LEFT JOIN Customer c ON inv.customerId = c.id
           WHERE ${where}
           ORDER BY inv.createdAt DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset],
        )
        const totalRow = await queryOne<any>(
          `SELECT COUNT(*) as count FROM Invoice inv WHERE ${where}`,
          params,
        )
        return ok({ invoices: rows, total: totalRow?.count ?? 0 })
      }

      // POST /api/invoices
      if (!segs[1] && method === 'POST') {
        const b = (await req.json()) as any
        validateRequired(b, ['customerId', 'issueDate', 'dueDate', 'terms'])
        if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
          return err('Minimal 1 item')
        }
        // Generate invoice number: INV-YYYYMMDD-XXXX
        const dateStr = (b.issueDate as string).replace(/-/g, '')
        const countRow = await queryOne<any>(`SELECT COUNT(*) as c FROM Invoice WHERE storeId=?`, [
          storeId,
        ])
        const seq = String((countRow?.c ?? 0) + 1).padStart(4, '0')
        const number = `INV-${dateStr}-${seq}`
        const subtotal = (b.items as any[]).reduce(
          (s: number, i: any) => s + Number(i.qty) * Number(i.unitPrice),
          0,
        )
        const taxAmount = (b.items as any[]).reduce(
          (s: number, i: any) =>
            s + Math.round(Number(i.qty) * Number(i.unitPrice) * (Number(i.taxRate) / 100)),
          0,
        )
        const total = subtotal + taxAmount
        const t = nowISO()
        const id = newId()
        await exec(
          `INSERT INTO Invoice (id,storeId,customerId,number,status,issueDate,dueDate,terms,notes,subtotal,taxAmount,total,createdAt,updatedAt)
           VALUES (?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?)`,
          [
            id,
            storeId,
            b.customerId,
            number,
            b.issueDate,
            b.dueDate,
            b.terms,
            b.notes ?? null,
            subtotal,
            taxAmount,
            total,
            t,
            t,
          ],
        )
        for (const item of b.items as any[]) {
          await exec(
            `INSERT INTO InvoiceItem (id,invoiceId,description,qty,unitPrice,taxRate,subtotal,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
            [
              newId(),
              id,
              item.description,
              Number(item.qty),
              Number(item.unitPrice),
              Number(item.taxRate ?? 0),
              Number(item.qty) * Number(item.unitPrice),
              t,
            ],
          )
        }
        return ok({ id, number }, 201)
      }

      // GET /api/invoices/:id
      if (segs[1] && !segs[2] && method === 'GET') {
        const inv = await queryOne<any>(
          `SELECT inv.*, c.name as customerName FROM Invoice inv LEFT JOIN Customer c ON inv.customerId=c.id WHERE inv.id=? AND inv.storeId=?`,
          [segs[1], storeId],
        )
        if (!inv) return err('Invoice tidak ditemukan', 404)
        const items = await query(`SELECT * FROM InvoiceItem WHERE invoiceId=? ORDER BY rowid`, [
          segs[1],
        ])
        return ok({ ...inv, items })
      }

      // PATCH /api/invoices/:id
      if (segs[1] && !segs[2] && method === 'PATCH') {
        const b = (await req.json()) as any
        const allowed = new Set(['status', 'notes', 'dueDate', 'terms'])
        const cols = filterCols(b, allowed)
        if (Object.keys(cols).length === 0) return err('No valid fields')
        const { setClauses, values } = buildUpdate(cols)
        await exec(`UPDATE Invoice SET ${setClauses}, updatedAt=? WHERE id=? AND storeId=?`, [
          ...values,
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true })
      }

      // POST /api/invoices/:id/send
      if (segs[1] && segs[2] === 'send' && method === 'POST') {
        const inv = await queryOne<any>(`SELECT * FROM Invoice WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!inv) return err('Invoice tidak ditemukan', 404)
        if (inv.status !== 'DRAFT') return err('Hanya invoice DRAFT yang bisa dikirim')
        await exec(`UPDATE Invoice SET status='SENT', updatedAt=? WHERE id=? AND storeId=?`, [
          nowISO(),
          segs[1],
          storeId,
        ])
        return ok({ success: true, status: 'SENT' })
      }

      // POST /api/invoices/:id/pay
      if (segs[1] && segs[2] === 'pay' && method === 'POST') {
        const inv = await queryOne<any>(`SELECT * FROM Invoice WHERE id=? AND storeId=?`, [
          segs[1],
          storeId,
        ])
        if (!inv) return err('Invoice tidak ditemukan', 404)
        if (inv.status === 'PAID') return err('Invoice sudah lunas')
        if (inv.status === 'DRAFT') return err('Invoice harus dikirim terlebih dahulu')
        await exec(`UPDATE Invoice SET status='PAID', updatedAt=? WHERE id=? AND storeId=?`, [
          nowISO(),
          segs[1],
          storeId,
        ])
        // Post journal entry: Debit Cash (1100), Credit Revenue (4100)
        await postJournalEntry(storeId, `Invoice Payment: ${inv.number}`, [
          { accountCode: '1100', debit: Number(inv.total) || 0, credit: 0 },
          { accountCode: '4100', debit: 0, credit: Number(inv.total) || 0 },
        ])
        return ok({ success: true, status: 'PAID' })
      }
    }

    // ── REPORTS / HEATMAP ─────────────────────────────────────────────────────
    if (segs[0] === 'reports' && segs[1] === 'heatmap' && method === 'GET') {
      const from = sp.get('from') ?? new Date(Date.now() - 86400000 * 90).toISOString().slice(0, 10)
      const to = sp.get('to') ?? new Date().toISOString().slice(0, 10)

      // Aggregate orders by hour-of-day AND day-of-week for the given range
      const raw = (await query(
        `SELECT
           CAST(strftime('%H', createdAt) AS INTEGER) AS hour,
           CAST(strftime('%w', createdAt) AS INTEGER) AS dayOfWeek,
           COUNT(*) AS orderCount,
           COALESCE(SUM(total), 0) AS revenue
         FROM "Order"
         WHERE storeId = ? AND status = 'PAID'
           AND DATE(createdAt) BETWEEN ? AND ?
         GROUP BY hour, dayOfWeek
         ORDER BY dayOfWeek, hour`,
        [storeId, from, to],
      )) as any[]

      const cells = raw.map((r: any) => ({
        hour: Number(r.hour),
        dayOfWeek: Number(r.dayOfWeek),
        orderCount: Number(r.orderCount),
        revenue: Number(r.revenue),
      }))

      return ok({ cells })
    }

    // ── REPORTS / SCHEDULED ───────────────────────────────────────────────────
    // Lazy-init ScheduledReport table
    async function ensureScheduledReportTable() {
      await exec(`
        CREATE TABLE IF NOT EXISTS ScheduledReport (
          id          TEXT PRIMARY KEY,
          storeId     TEXT NOT NULL,
          type        TEXT NOT NULL DEFAULT 'summary',
          frequency   TEXT NOT NULL DEFAULT 'weekly',
          recipients  TEXT NOT NULL DEFAULT '[]',
          lastSentAt  TEXT,
          createdAt   TEXT NOT NULL,
          updatedAt   TEXT NOT NULL
        )
      `)
    }

    // GET /api/reports/scheduled?storeId=
    if (segs[0] === 'reports' && segs[1] === 'scheduled' && !segs[2] && method === 'GET') {
      await ensureScheduledReportTable()
      const rows = (await query(
        `SELECT * FROM ScheduledReport WHERE storeId = ? ORDER BY createdAt DESC`,
        [storeId],
      )) as any[]
      const items = rows.map((r: any) => ({
        ...r,
        recipients: (() => { try { return JSON.parse(r.recipients) } catch { return [] } })(),
      }))
      return ok({ items })
    }

    // POST /api/reports/scheduled?storeId= — create or update
    if (segs[0] === 'reports' && segs[1] === 'scheduled' && !segs[2] && method === 'POST') {
      await ensureScheduledReportTable()
      const body = await req.json() as { type?: string; frequency?: string; recipients?: string[] }
      const { type = 'summary', frequency, recipients = [] } = body
      if (!frequency || !['weekly', 'monthly'].includes(frequency)) {
        return err("frequency must be 'weekly' or 'monthly'", 400, 'VALIDATION_ERROR')
      }
      const id = newId()
      const now = nowISO()
      await exec(
        `INSERT INTO ScheduledReport (id, storeId, type, frequency, recipients, lastSentAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        [id, storeId, type, frequency, JSON.stringify(recipients), now, now],
      )
      return ok({ id, storeId, type, frequency, recipients, lastSentAt: null, createdAt: now, updatedAt: now }, 201)
    }

    // DELETE /api/reports/scheduled/:id
    if (segs[0] === 'reports' && segs[1] === 'scheduled' && segs[2] && method === 'DELETE') {
      await ensureScheduledReportTable()
      await exec(`DELETE FROM ScheduledReport WHERE id = ? AND storeId = ?`, [segs[2], storeId])
      return ok({ success: true })
    }

    // POST /api/reports/scheduled/send/:id — stub: marks lastSentAt
    if (segs[0] === 'reports' && segs[1] === 'scheduled' && segs[2] === 'send' && segs[3] && method === 'POST') {
      await ensureScheduledReportTable()
      const schedule = await queryOne<any>(
        `SELECT * FROM ScheduledReport WHERE id = ? AND storeId = ?`,
        [segs[3], storeId],
      )
      if (!schedule) return err('Scheduled report not found', 404, 'NOT_FOUND')
      const now = nowISO()
      await exec(
        `UPDATE ScheduledReport SET lastSentAt = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
        [now, now, segs[3], storeId],
      )
      // TODO: integrate with email provider (e.g. SendGrid / Nodemailer)
      return ok({ success: true, sentAt: now, stub: true })
    }

    return err('Not found', 404, 'NOT_FOUND', requestId, startMs)
  } catch (e: any) {
    console.error('API error:', e)
    if (e instanceof ValidationError) {
      return err(e.message, e.status, e.code, requestId, startMs)
    }
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId,
        ...(isProd ? {} : { detail: e?.message }),
      },
      {
        status: 500,
        headers: makeHeaders(requestId, startMs),
      },
    )
  }
}
