// GET /api/receipt-templates?storeId=
// POST /api/receipt-templates
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ReceiptTemplate (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'POS',
      headerText  TEXT NOT NULL DEFAULT '',
      footerText  TEXT NOT NULL DEFAULT '',
      showLogo    INTEGER NOT NULL DEFAULT 1,
      showTax     INTEGER NOT NULL DEFAULT 1,
      showBarcode INTEGER NOT NULL DEFAULT 0,
      fontSize    TEXT NOT NULL DEFAULT 'MEDIUM',
      paperWidth  TEXT NOT NULL DEFAULT '80mm',
      active      INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT NOT NULL
    )
  `)
}

function mapRow(r: any) {
  return {
    ...r,
    showLogo:    Boolean(r.showLogo),
    showTax:     Boolean(r.showTax),
    showBarcode: Boolean(r.showBarcode),
    active:      Boolean(r.active),
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM ReceiptTemplate WHERE storeId=? ORDER BY createdAt DESC`,
    [storeId],
  )
  return NextResponse.json((rows as any[]).map(mapRow))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any

  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')

  const validTypes = ['POS', 'DELIVERY', 'RETURNS']
  const type = b.type ?? 'POS'
  if (!validTypes.includes(type))
    return err('type must be POS, DELIVERY, or RETURNS', 400, 'INVALID_VALUE')

  const validFontSizes = ['SMALL', 'MEDIUM', 'LARGE']
  const fontSize = b.fontSize ?? 'MEDIUM'
  if (!validFontSizes.includes(fontSize))
    return err('fontSize must be SMALL, MEDIUM, or LARGE', 400, 'INVALID_VALUE')

  const validWidths = ['58mm', '80mm']
  const paperWidth = b.paperWidth ?? '80mm'
  if (!validWidths.includes(paperWidth))
    return err('paperWidth must be 58mm or 80mm', 400, 'INVALID_VALUE')

  const id = newId()
  const t = nowISO()

  await exec(
    `INSERT INTO ReceiptTemplate
       (id, storeId, name, type, headerText, footerText,
        showLogo, showTax, showBarcode, fontSize, paperWidth, active, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      storeId,
      b.name.trim(),
      type,
      b.headerText ?? '',
      b.footerText ?? '',
      b.showLogo !== false ? 1 : 0,
      b.showTax !== false ? 1 : 0,
      b.showBarcode ? 1 : 0,
      fontSize,
      paperWidth,
      b.active !== false ? 1 : 0,
      t,
    ],
  )

  return NextResponse.json(
    mapRow({
      id,
      storeId,
      name: b.name.trim(),
      type,
      headerText:  b.headerText ?? '',
      footerText:  b.footerText ?? '',
      showLogo:    b.showLogo !== false ? 1 : 0,
      showTax:     b.showTax !== false ? 1 : 0,
      showBarcode: b.showBarcode ? 1 : 0,
      fontSize,
      paperWidth,
      active:      b.active !== false ? 1 : 0,
      createdAt:   t,
    }),
    { status: 201 },
  )
}
