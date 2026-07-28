// PATCH /api/receipt-templates/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id: tplId } = await params

  const existing = await queryOne(
    `SELECT * FROM ReceiptTemplate WHERE id=? AND storeId=?`,
    [tplId, storeId],
  )
  if (!existing) return err('Template not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}

  if (b.name !== undefined) {
    if (!b.name.trim()) return err("Field 'name' cannot be empty", 400, 'VALIDATION_ERROR')
    updates.name = b.name.trim()
  }
  if (b.type !== undefined) {
    const validTypes = ['POS', 'DELIVERY', 'RETURNS']
    if (!validTypes.includes(b.type))
      return err('type must be POS, DELIVERY, or RETURNS', 400, 'INVALID_VALUE')
    updates.type = b.type
  }
  if (b.headerText !== undefined)  updates.headerText  = b.headerText
  if (b.footerText !== undefined)  updates.footerText  = b.footerText
  if (b.showLogo !== undefined)    updates.showLogo    = b.showLogo ? 1 : 0
  if (b.showTax !== undefined)     updates.showTax     = b.showTax ? 1 : 0
  if (b.showBarcode !== undefined) updates.showBarcode = b.showBarcode ? 1 : 0
  if (b.active !== undefined)      updates.active      = b.active ? 1 : 0
  if (b.fontSize !== undefined) {
    const validFontSizes = ['SMALL', 'MEDIUM', 'LARGE']
    if (!validFontSizes.includes(b.fontSize))
      return err('fontSize must be SMALL, MEDIUM, or LARGE', 400, 'INVALID_VALUE')
    updates.fontSize = b.fontSize
  }
  if (b.paperWidth !== undefined) {
    const validWidths = ['58mm', '80mm']
    if (!validWidths.includes(b.paperWidth))
      return err('paperWidth must be 58mm or 80mm', 400, 'INVALID_VALUE')
    updates.paperWidth = b.paperWidth
  }

  if (Object.keys(updates).length === 0)
    return err('Nothing to update', 400, 'VALIDATION_ERROR')

  const { setClauses, values } = buildUpdate(updates)
  await exec(
    `UPDATE ReceiptTemplate SET ${setClauses} WHERE id=? AND storeId=?`,
    [...values, tplId, storeId],
  )

  return NextResponse.json({ updated: true })
}
