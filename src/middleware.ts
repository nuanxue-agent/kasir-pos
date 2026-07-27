import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const session = await auth()
  const pathname = request.nextUrl.pathname

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Protect admin routes to super admin only
    if (pathname.startsWith('/admin') && !session.user.isSuperAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Redirect logged-in users away from auth pages
  if ((pathname === '/login' || pathname === '/signup') && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup'],
}
