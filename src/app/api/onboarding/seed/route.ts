import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: any) { return NextResponse.json(data) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// Demo products keyed by store type
const DEMO_PRODUCTS: Record<string, Array<{ name: string; price: number; cost: number; stock: number; category: string }>> = {
  'Food & Beverage': [
    { name: 'Nasi Goreng Spesial',    price: 25000, cost: 10000, stock: 999, category: 'Makanan' },
    { name: 'Mie Ayam Bakso',         price: 20000, cost:  8000, stock: 999, category: 'Makanan' },
    { name: 'Es Teh Manis',           price:  5000, cost:  1500, stock: 999, category: 'Minuman' },
    { name: 'Jus Alpukat',            price: 15000, cost:  5000, stock: 999, category: 'Minuman' },
    { name: 'Pisang Goreng (5 pcs)',   price: 10000, cost:  3000, stock: 999, category: 'Snack' },
  ],
  Retail: [
    { name: 'Kaos Polos Cotton 30s',  price:  85000, cost: 40000, stock: 50, category: 'Pakaian' },
    { name: 'Celana Chino Panjang',   price: 120000, cost: 60000, stock: 30, category: 'Pakaian' },
    { name: 'Kaus Kaki 3-pack',       price:  25000, cost: 10000, stock: 100, category: 'Aksesoris' },
    { name: 'Topi Baseball Polos',    price:  45000, cost: 20000, stock: 40, category: 'Aksesoris' },
    { name: 'Tas Selempang Canvas',   price:  95000, cost: 45000, stock: 20, category: 'Tas' },
  ],
  Service: [
    { name: 'Potong Rambut Reguler',  price:  35000, cost:  5000, stock: 999, category: 'Haircut' },
    { name: 'Creambath',              price:  75000, cost: 15000, stock: 999, category: 'Treatment' },
    { name: 'Manicure',               price:  50000, cost: 10000, stock: 999, category: 'Nail' },
    { name: 'Cuci + Setrika (kg)',    price:   7000, cost:  2000, stock: 999, category: 'Laundry' },
    { name: 'Servis AC Standar',      price: 150000, cost: 50000, stock: 999, category: 'Teknik' },
  ],
  Manufacturing: [
    { name: 'Produk Jadi A',          price: 200000, cost: 100000, stock: 20, category: 'Produk Jadi' },
    { name: 'Produk Jadi B',          price: 350000, cost: 180000, stock: 15, category: 'Produk Jadi' },
    { name: 'Bahan Baku 1 (kg)',      price:  50000, cost:  40000, stock: 200, category: 'Bahan Baku' },
    { name: 'Bahan Baku 2 (liter)',   price:  30000, cost:  22000, stock: 100, category: 'Bahan Baku' },
    { name: 'Spare Part Mesin X',     price:  80000, cost:  60000, stock: 30, category: 'Suku Cadang' },
  ],
  Other: [
    { name: 'Produk Demo 1',          price: 50000, cost: 25000, stock: 50, category: 'Umum' },
    { name: 'Produk Demo 2',          price: 75000, cost: 35000, stock: 40, category: 'Umum' },
    { name: 'Produk Demo 3',          price: 30000, cost: 12000, stock: 80, category: 'Umum' },
    { name: 'Produk Demo 4',          price: 120000, cost: 60000, stock: 20, category: 'Umum' },
    { name: 'Produk Demo 5',          price: 15000, cost:  5000, stock: 100, category: 'Umum' },
  ],
}

// 20 standard COA entries (Indonesian PSAK-compatible)
const COA_ENTRIES = [
  // ASSETS
  { code: '111', name: 'Kas',                      type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '112', name: 'Bank',                     type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '113', name: 'Piutang Usaha',            type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '114', name: 'Persediaan',               type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '115', name: 'Biaya Dibayar Dimuka',     type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '120', name: 'Peralatan & Mesin',        type: 'ASSET',     normalBalance: 'DEBIT'  },
  // LIABILITIES
  { code: '210', name: 'Hutang Usaha',             type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '211', name: 'Hutang Pajak',             type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '212', name: 'Hutang Gaji',              type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '220', name: 'Pinjaman Jangka Panjang',  type: 'LIABILITY', normalBalance: 'CREDIT' },
  // EQUITY
  { code: '310', name: 'Modal',                    type: 'EQUITY',    normalBalance: 'CREDIT' },
  { code: '320', name: 'Laba Ditahan',             type: 'EQUITY',    normalBalance: 'CREDIT' },
  { code: '330', name: 'Prive',                    type: 'EQUITY',    normalBalance: 'DEBIT'  },
  // REVENUE
  { code: '410', name: 'Penjualan',                type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '420', name: 'Pendapatan Jasa',          type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '490', name: 'Pendapatan Lain-lain',     type: 'REVENUE',   normalBalance: 'CREDIT' },
  // EXPENSES
  { code: '510', name: 'Harga Pokok Penjualan',    type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '520', name: 'Gaji & Upah',              type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '530', name: 'Sewa',                     type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '540', name: 'Listrik & Air',            type: 'EXPENSE',   normalBalance: 'DEBIT'  },
]

const DEMO_CUSTOMERS = [
  { name: 'Budi Santoso',  phone: '081234567001', email: 'budi@example.com',  points: 150 },
  { name: 'Siti Rahayu',   phone: '081234567002', email: 'siti@example.com',  points: 320 },
  { name: 'Ahmad Fauzi',   phone: '081234567003', email: 'ahmad@example.com', points: 75  },
]

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  try {
    const body = await req.json() as {
      storeId: string
      storeType?: string
      products?: boolean
      accounts?: boolean
      customers?: boolean
    }

    const { storeId, storeType = 'Other', products = false, accounts = false, customers = false } = body

    if (!storeId) return err('storeId required')

    // Verify caller owns the store
    const ownsStore = user.stores?.some((s: any) => s.id === storeId)
    if (!ownsStore) return err('Forbidden', 403)

    const t = nowISO()
    const seeded: string[] = []

    // ── Products ──────────────────────────────────────────────────────────────
    if (products) {
      const list = DEMO_PRODUCTS[storeType] ?? DEMO_PRODUCTS['Other']

      // Create a single demo category per unique category name
      const categoryNames = [...new Set(list.map(p => p.category))]
      const categoryIds: Record<string, string> = {}
      const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6']

      for (let i = 0; i < categoryNames.length; i++) {
        const catName = categoryNames[i]
        // Check if category already exists
        const existing = await query<any>(
          `SELECT id FROM Category WHERE storeId=? AND name=? LIMIT 1`,
          [storeId, catName]
        )
        if (existing.length > 0) {
          categoryIds[catName] = existing[0].id
        } else {
          const catId = newId()
          await exec(
            `INSERT INTO Category (id, storeId, name, color, sortOrder, active, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            [catId, storeId, catName, COLORS[i % COLORS.length], i, t, t]
          )
          categoryIds[catName] = catId
        }
      }

      for (const p of list) {
        const pid = newId()
        await exec(
          `INSERT OR IGNORE INTO Product
             (id, storeId, categoryId, name, price, cost, trackStock, stock, lowStock, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, 5, 1, ?, ?)`,
          [pid, storeId, categoryIds[p.category], p.name, p.price, p.cost, p.stock, t, t]
        )
      }
      seeded.push(`${list.length} products`)
    }

    // ── Chart of Accounts ─────────────────────────────────────────────────────
    if (accounts) {
      for (const acc of COA_ENTRIES) {
        const aid = newId()
        await exec(
          `INSERT OR IGNORE INTO "Account"
             (id, storeId, code, name, type, normalBalance, balance, active, isSystem, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)`,
          [aid, storeId, acc.code, acc.name, acc.type, acc.normalBalance, t, t]
        )
      }
      seeded.push(`${COA_ENTRIES.length} GL accounts`)
    }

    // ── Customers ─────────────────────────────────────────────────────────────
    if (customers) {
      for (const c of DEMO_CUSTOMERS) {
        const cid = newId()
        await exec(
          `INSERT OR IGNORE INTO Customer (id, storeId, name, phone, email, points, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cid, storeId, c.name, c.phone, c.email, c.points, t, t]
        )
      }
      seeded.push(`${DEMO_CUSTOMERS.length} customers`)
    }

    return ok({ success: true, seeded })
  } catch (e: any) {
    console.error('Seed error:', e)
    return err('Seed failed: ' + (e?.message ?? 'unknown'), 500)
  }
}
