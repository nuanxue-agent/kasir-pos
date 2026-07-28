// POST /api/subscriptions/process-billing
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const today = new Date().toISOString().slice(0, 10)
  const due = await query<any>(
    `SELECT cs.*, mp.price, mp.billingCycle, mp.durationDays
     FROM CustomerSubscription cs
     JOIN MembershipPlan mp ON cs.planId = mp.id
     WHERE cs.storeId=? AND cs.status='ACTIVE' AND cs.autoRenew=1
       AND cs.nextBillingAt <= ?`,
    [storeId, today],
  )
  let processed = 0
  for (const sub of due as any[]) {
    const d = new Date(sub.nextBillingAt)
    if (sub.billingCycle === 'MONTHLY') d.setMonth(d.getMonth() + 1)
    else if (sub.billingCycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
    else if (sub.billingCycle === 'ANNUAL') d.setFullYear(d.getFullYear() + 1)
    else d.setDate(d.getDate() + (sub.durationDays ?? 30))
    const nextBillingAt = d.toISOString().slice(0, 10)
    await exec(`UPDATE CustomerSubscription SET nextBillingAt=?, updatedAt=? WHERE id=?`, [
      nextBillingAt,
      nowISO(),
      sub.id,
    ])
    processed++
  }
  return NextResponse.json({ processed, date: today })
}
