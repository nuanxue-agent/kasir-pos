import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureCurrencyTables } from '../route'
import { convertBetween } from '@/lib/multi-currency'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCurrencyTables()

  const b = (await req.json()) as any
  const { amount, from, to } = b
  if (amount === undefined || amount === null) return err("Field 'amount' is required", 400, 'MISSING_FIELD')
  if (!from) return err("Field 'from' is required", 400, 'MISSING_FIELD')
  if (!to) return err("Field 'to' is required", 400, 'MISSING_FIELD')

  const numAmount = Number(amount)
  if (isNaN(numAmount)) return err('amount must be a number', 400, 'INVALID_FIELD')

  const rows = await query(
    `SELECT * FROM Currency WHERE storeId = ? AND active = 1`,
    [storeId],
  )
  const currencies = (rows as any[]).map(r => ({
    ...r,
    isBase: Boolean(r.isBase),
    active: Boolean(r.active),
  }))

  const fromUpper = from.toUpperCase()
  const toUpper = to.toUpperCase()

  const fromCurrency = currencies.find(c => c.code === fromUpper)
  const toCurrency = currencies.find(c => c.code === toUpper)

  if (!fromCurrency) return err(`Currency '${from}' not found or inactive`, 404, 'NOT_FOUND')
  if (!toCurrency) return err(`Currency '${to}' not found or inactive`, 404, 'NOT_FOUND')

  const converted = convertBetween(numAmount, fromUpper, toUpper, currencies)
  if (converted === null) return err('Conversion failed — check exchange rates', 500, 'CONVERSION_ERROR')

  return NextResponse.json({
    amount: numAmount,
    from: fromUpper,
    to: toUpper,
    converted,
    rate: toCurrency.exchangeRate / fromCurrency.exchangeRate,
  })
}
