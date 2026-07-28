// PATCH /api/customer-credits/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { calcAvailableCredit, determineCreditStatus } from '@/lib/credit-limits'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  if (!id) return err('id required', 400, 'MISSING_FIELD')

  const rows = await query(`SELECT * FROM CustomerCredit WHERE id=? LIMIT 1`, [id])
  const credit = (rows as any[])[0]
  if (!credit) return err('Credit account not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const now = nowISO()

  const creditLimit = b.creditLimit != null ? Number(b.creditLimit) : credit.creditLimit
  const paymentTermsDays = b.paymentTermsDays != null ? Number(b.paymentTermsDays) : credit.paymentTermsDays

  if (creditLimit <= 0) return err('creditLimit must be positive', 400, 'INVALID_VALUE')
  if (paymentTermsDays <= 0) return err('paymentTermsDays must be positive', 400, 'INVALID_VALUE')

  const usedCredit = credit.usedCredit
  const availableCredit = calcAvailableCredit(creditLimit, usedCredit)
  // Allow manual status override, otherwise auto-derive
  const status = b.status ?? determineCreditStatus(creditLimit, usedCredit)

  const VALID_STATUSES = ['GOOD', 'WARNING', 'FROZEN']
  if (!VALID_STATUSES.includes(status)) return err('Invalid status value', 400, 'INVALID_VALUE')

  await exec(
    `UPDATE CustomerCredit
     SET creditLimit=?, availableCredit=?, paymentTermsDays=?, status=?, updatedAt=?
     WHERE id=?`,
    [creditLimit, availableCredit, paymentTermsDays, status, now, id],
  )

  return NextResponse.json({ ...credit, creditLimit, availableCredit, paymentTermsDays, status, updatedAt: now })
}
