import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, createSession, setSessionCookie } from '@/lib/auth'
import type { SessionUser } from '@/lib/auth'

function ok(data: any, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/session/store — switch the active store in the session cookie
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json().catch(() => null)) as { storeId?: string } | null
    if (!body || typeof body.storeId !== 'string') {
      return err('storeId is required')
    }

    const { storeId } = body
    const user = session.user as SessionUser & { activeStoreId?: string }

    // Verify the user actually has access to this store
    const userStores = user.stores ?? []
    const targetStore = userStores.find(s => s.id === storeId)
    if (!targetStore) {
      return err('Store not found or access denied', 403)
    }

    // Rebuild session payload with updated activeStoreId
    const updatedUser: SessionUser & { activeStoreId?: string } = {
      ...user,
      activeStoreId: storeId,
    }

    const token = await createSession(updatedUser)
    const res = ok({ success: true, storeId, storeName: targetStore.name })
    setSessionCookie(res, token)
    return res
  } catch (e: any) {
    console.error('PATCH /api/session/store error:', e)
    return err('Internal server error', 500)
  }
}
