import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { createSession, setSessionCookie } from '@/lib/auth'

function ok(data: any) { return NextResponse.json(data) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeId = user.stores?.[0]?.id
  if (!storeId) return err('No store found', 400)

  try {
    const body = await req.json() as { step: string; data: any }
    const { step, data } = body

    if (step === 'business_type') {
      // Update store modules based on business type
      const modules = JSON.stringify(data.modules ?? ['pos','inventory','customers','discounts','reports'])
      await exec(`UPDATE Store SET modules=?, updatedAt=? WHERE id=?`, [modules, nowISO(), storeId])
      return ok({ success: true })
    }

    if (step === 'store_info') {
      // Update store details
      const { name, address, phone, currency, timezone } = data
      await exec(
        `UPDATE Store SET name=?, address=?, phone=?, currency=?, timezone=?, updatedAt=? WHERE id=?`,
        [name, address ?? null, phone ?? null, currency ?? 'IDR', timezone ?? 'Asia/Jakarta', nowISO(), storeId]
      )
      return ok({ success: true })
    }

    if (step === 'first_product') {
      // Add first product if provided
      if (data?.name && data?.price) {
        const { newId } = await import('@/lib/db')
        const t = nowISO()
        await exec(
          `INSERT INTO Product (id,storeId,name,price,cost,trackStock,stock,lowStock,active,createdAt,updatedAt) VALUES (?,?,?,?,0,1,?,5,1,?,?)`,
          [newId(), storeId, data.name, Number(data.price), Number(data.stock ?? 0), t, t]
        )
      }
      return ok({ success: true })
    }

    if (step === 'complete') {
      // Mark user as onboarded
      await exec(`UPDATE User SET onboarded=1, updatedAt=? WHERE id=?`, [nowISO(), user.id])

      // Refresh session with onboarded=true and updated store info
      const { query, queryOne } = await import('@/lib/db')
      const stores = await query<any>(
        `SELECT su.storeId as id, s.name, su.role, s.currency, s.taxRate,
                COALESCE(s.modules,'["pos","inventory","customers","discounts","reports"]') as modules
         FROM StoreUser su JOIN Store s ON su.storeId=s.id WHERE su.userId=?`,
        [user.id]
      )
      const updatedUser = {
        ...user,
        onboarded: true,
        stores: stores.map((s: any) => ({
          ...s,
          modules: (() => { try { return JSON.parse(s.modules) } catch { return ['pos','inventory','customers','discounts','reports'] } })()
        }))
      }
      const token = await createSession(updatedUser)
      const res = ok({ success: true })
      setSessionCookie(res, token)
      return res
    }

    return err('Unknown step')
  } catch (e: any) {
    console.error('Onboarding error:', e)
    return err('Onboarding failed', 500)
  }
}
