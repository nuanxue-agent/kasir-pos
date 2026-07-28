// GET /api/combos/[id]/savings?storeId=
// Returns combo price, individual total, savings amount and savings %
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { ensureCombTables } from '../../route'
import { calcComboPrice, calcIndividualTotal, calcSavings, calcSavingsPct } from '@/lib/combo-builder'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: comboId } = await params
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const combo = (await queryOne(
    `SELECT * FROM Combo WHERE id = ? AND storeId = ?`,
    [comboId, storeId],
  )) as any
  if (!combo) return err('Combo not found', 404, 'NOT_FOUND')

  const rawItems = (await query(
    `SELECT ci.*, p.price as productPrice
     FROM ComboItem ci
     LEFT JOIN Product p ON p.id = ci.productId
     WHERE ci.comboId = ? AND ci.storeId = ?`,
    [comboId, storeId],
  )) as any[]

  const items = rawItems.map(r => ({ ...r, isOptional: Boolean(r.isOptional) }))

  const comboPrice      = calcComboPrice(combo.basePrice, combo.discountType, combo.discountValue)
  const individualTotal = calcIndividualTotal(items, false) // required items only
  const savings         = calcSavings(combo, items, false)
  const savingsPct      = calcSavingsPct(combo, items, false)

  const individualTotalAll = calcIndividualTotal(items, true)
  const savingsAll         = calcSavings(combo, items, true)
  const savingsPctAll      = calcSavingsPct(combo, items, true)

  return NextResponse.json({
    comboId,
    comboName: combo.name,
    basePrice: combo.basePrice,
    discountType: combo.discountType,
    discountValue: combo.discountValue,
    comboPrice,
    // Required items only
    individualTotal,
    savings,
    savingsPct,
    // All items (required + optional)
    individualTotalAll,
    savingsAll,
    savingsPctAll,
  })
}
