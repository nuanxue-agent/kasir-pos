import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

// Security headers applied to every response
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-inline/eval in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value)
  }
  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes — no auth check needed
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/' ||
    pathname === '/favicon.ico'
  ) {
    const res = NextResponse.next()
    return applySecurityHeaders(res)
  }

  // Protected routes — require valid session
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/')) {
    const session = await getSessionFromRequest(req)
    if (!session) {
      if (pathname.startsWith('/api/')) {
        const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        return applySecurityHeaders(res)
      }
      const res = NextResponse.redirect(new URL('/login', req.url))
      return applySecurityHeaders(res)
    }
  }

  const res = NextResponse.next()
  return applySecurityHeaders(res)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
