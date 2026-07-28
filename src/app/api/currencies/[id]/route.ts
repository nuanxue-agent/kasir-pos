import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureCurrencyTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCurrencyTables()

  const existing = await query(
    `SELECT * FROM Currency WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any[]
  if (existing.length === 0) return err('Currency not found', 404, 'NOT_FOUND')
  const current = existing[0]

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name) }
  if (b.symbol !== undefined) { sets.push('symbol = ?'); vals.push(b.symbol) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  // Handle exchangeRate update — also record in history
  if (b.exchangeRate !== undefined) {
    const newRate = Number(b.exchangeRate)
    if (isNaN(newRate) || newRate <= 0) return err('exchangeRate must be a positive number', 400, 'INVALID_FIELD')
    if (current.isBase) return err('Cannot change exchange rate of base currency', 400, 'INVALID_FIELD')
    sets.push('exchangeRate = ?')
    vals.push(newRate)

    // Record rate change in history
    const t = nowISO()
    const baseCurrency = await query(
      `SELECT code FROM Currency WHERE storeId = ? AND isBase = 1`,
      [storeId],
    ) as any[]
    if (baseCurrency.length > 0) {
      await exec(
        `INSERT INTO ExchangeRateHistory (id, storeId, fromCurrency, toCurrency, rate, recordedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), storeId, baseCurrency[0].code, current.code, newRate, t],
      )
    }
  }

  // Handle isBase change
  if (b.isBase === true && !current.isBase) {
    // Unset previous base
    await exec(
      `UPDATE Currency SET isBase = 0, exchangeRate = exchangeRate, updatedAt = ? WHERE storeId = ? AND isBase = 1`,
      [nowISO(), storeId],
    )
    sets.push('isBase = ?')
    vals.push(1)
    sets.push('exchangeRate = ?')
    vals.push(1.0)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Currency SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
