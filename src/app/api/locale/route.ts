import { NextResponse } from 'next/server'
import { locales, type Locale } from '@/i18n/routing'

export async function POST(req: Request) {
  const body = await req.json() as { locale?: unknown }
  const locale = body.locale as string | undefined
  if (!locale || !locales.includes(locale as Locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return res
}
