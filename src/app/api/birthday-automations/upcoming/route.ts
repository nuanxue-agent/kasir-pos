// GET /api/birthday-automations/upcoming?storeId=&window=30
// Returns customers with birthdays/anniversaries in the next N days
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureBirthdayTables } from '../route'
import { daysUntilNextBirthday } from '@/lib/birthday-automation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const windowDays = Math.min(365, Math.max(1, Number(sp.get('window') ?? 30)))

  await ensureBirthdayTables()

  // Fetch customers with birthday or anniversary data
  const customers = await query(
    `SELECT id, name, phone, birthday, anniversaryDate, signupDate
     FROM Customer
     WHERE storeId = ?
       AND (birthday IS NOT NULL OR anniversaryDate IS NOT NULL OR signupDate IS NOT NULL)`,
    [storeId],
  ).catch(() => [] as any[])

  const now = new Date()

  const upcoming = (customers as any[])
    .flatMap(c => {
      const results: any[] = []

      const checks: Array<{ type: string; dateISO: string | null }> = [
        { type: 'BIRTHDAY', dateISO: c.birthday },
        { type: 'ANNIVERSARY', dateISO: c.anniversaryDate },
        { type: 'SIGNUP_ANNIVERSARY', dateISO: c.signupDate },
      ]

      for (const { type, dateISO } of checks) {
        if (!dateISO) continue
        const days = daysUntilNextBirthday(dateISO, now)
        if (days >= 0 && days <= windowDays) {
          results.push({
            customerId: c.id,
            name: c.name,
            phone: c.phone,
            triggerType: type,
            dateISO,
            daysUntil: days,
          })
        }
      }

      return results
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  return NextResponse.json(upcoming)
}
