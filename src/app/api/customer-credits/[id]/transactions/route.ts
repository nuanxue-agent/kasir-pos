// GET  /api/customer-credits/[id]/transactions
// POST /api/customer-credits/[id]/transactions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { applyTransaction, calcAvailableCredit, determineCreditStatus } from '@/lib/credit-limits'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  if (!id) return err('id required', 400, 'MISSING_FIELD')

  const creditRows = await query(`SELECT id, customerId, storeId FROM CustomerCredit WHERE id=? LIMIT 1`, [id])
  const credit = (creditRows as any[])[0]
  if (!credit) return err('Credit account not found', 404, 'NOT_FOUND')

  const txns = await query(
    `SELECT * FROM CreditTransaction
     WHERE customerId=? AND storeId=?
     ORDER BY createdAt DESC
     LIMIT 200`,
    [credit.customerId, credit.storeId],
  )

  return NextResponse.json(txns)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  if (!id) return err('id required', 400, 'MISSING_FIELD')

  const creditRows = await query(`SELECT * FROM CustomerCredit WHERE id=? LIMIT 1`, [id])
  const credit = (creditRows as any[])[0]
  if (!credit) return err('Credit account not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const { type, amount, reference } = b

  const VALID_TYPES = ['CHARGE', 'PAYMENT', 'ADJUSTMENT']
  if (!type || !VALID_TYPES.includes(type)) return err('type must be CHARGE, PAYMENT, or ADJUSTMENT', 400, 'INVALID_VALUE')

  const amt = Number(amount)
  if (isNaN(amt) || amt === 0) return err('amount must be a non-zero number', 400, 'INVALID_VALUE')

  // For CHARGE, enforce credit availability
  if (type === 'CHARGE') {
    if (credit.status === 'FROZEN') return err('Credit account is frozen — no new charges allowed', 400, 'ACCOUNT_FROZEN')
    if (credit.usedCredit + amt > credit.creditLimit) return err('Charge would exceed credit limit', 400, 'CREDIT_LIMIT_EXCEEDED')
  }

  const newUsed = applyTransaction(credit.usedCredit, type, amt)
  const newAvailable = calcAvailableCredit(credit.creditLimit, newUsed)
  const newStatus = determineCreditStatus(credit.creditLimit, newUsed)
  const now = nowISO()
  const txId = newId()

  // Insert transaction
  await exec(
    `INSERT INTO CreditTransaction (id, customerId, storeId, type, amount, balance, reference, createdAt)
     VALUES (?,?,?,?,?,?,?,?)`,
    [txId, credit.customerId, credit.storeId, type, amt, newUsed, reference ?? null, now],
  )

  // Update credit account
  await exec(
    `UPDATE CustomerCredit
     SET usedCredit=?, availableCredit=?, status=?, updatedAt=?
     WHERE id=?`,
    [newUsed, newAvailable, newStatus, now, id],
  )

  return NextResponse.json(
    { id: txId, customerId: credit.customerId, storeId: credit.storeId, type, amount: amt, balance: newUsed, reference: reference ?? null, createdAt: now },
    { status: 201 },
  )
}
