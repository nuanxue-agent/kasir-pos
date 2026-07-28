import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function updateSplitStatus(splitId: string) {
  const payers = await (await import('@/lib/db')).query(
    `SELECT paid FROM SplitBillPayer WHERE splitId = ?`, [splitId]
  )
  const all = payers as any[]
  let status = 'PENDING'
  if (all.every((p: any) => p.paid === 1)) status = 'PAID'
  else if (all.some((p: any) => p.paid === 1)) status = 'PARTIAL'
  await exec(`UPDATE SplitBill SET status = ? WHERE id = ?`, [status, splitId])
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payerId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const { id: splitId, payerId } = await params

    const body = await req.json() as any
    const { paid, paymentMethod } = body

    const payer = await queryOne(
      `SELECT * FROM SplitBillPayer WHERE id = ? AND splitId = ?`,
      [payerId, splitId]
    )
    if (!payer) return err('Payer not found', 404)

    await exec(
      `UPDATE SplitBillPayer SET paid = ?, paidAt = ?, paymentMethod = ? WHERE id = ?`,
      [paid ? 1 : 0, paid ? nowISO() : null, paymentMethod ?? null, payerId]
    )

    await updateSplitStatus(splitId)

    const updated = await queryOne(`SELECT * FROM SplitBillPayer WHERE id = ?`, [payerId])
    return ok({ data: updated })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
