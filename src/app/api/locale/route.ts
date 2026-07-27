import { NextResponse } from 'next/server'
import { locales } from '@/i18n/config'
export async function POST(req: Request) {
  const body = await req.json() as { locale?: unknown }
  const { locale } = body
  if (!locales.includes(locale)) return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return res
}
