import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/signup') || 
      pathname.startsWith('/api/auth') || pathname.startsWith('/_next') ||
      pathname === '/') {
    return NextResponse.next()
  }

  // Protected routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/')) {
    const session = await getSessionFromRequest(req)
    if (!session) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
