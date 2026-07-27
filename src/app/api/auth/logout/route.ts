import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export const runtime = 'edge'

export async function POST() {
  const res = NextResponse.json({ success: true })
  clearSessionCookie(res)
  return res
}
