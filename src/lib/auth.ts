// Tiny edge-compatible JWT auth — replaces next-auth
// Uses Web Crypto API (available in all edge runtimes)
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'kasir_session'
const ALG = { name: 'HMAC', hash: 'SHA-256' }

async function getKey() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET environment variable is not set')
  const enc = new TextEncoder().encode(secret)
  return crypto.subtle.importKey('raw', enc, ALG, false, ['sign', 'verify'])
}

async function sign(payload: object): Promise<string> {
  const key = await getKey()
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 86400000 * 7 }))
  const data = `${header}.${body}`
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(data))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return `${data}.${sigB64}`
}

async function verify(token: string): Promise<any | null> {
  try {
    const [header, body, sig] = token.split('.')
    if (!header || !body || !sig) return null
    const key = await getKey()
    const data = `${header}.${body}`
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify(ALG, key, sigBytes, new TextEncoder().encode(data))
    if (!valid) return null
    const payload = JSON.parse(atob(body))
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  tenantId?: string
  stores: Array<{ id: string; name: string; role: string; currency: string; taxRate: number }>
}

export interface Session {
  user: SessionUser
}

export async function createSession(user: SessionUser): Promise<string> {
  return sign(user)
}

export async function getSession(): Promise<Session | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await verify(token)
    if (!payload) return null
    return { user: payload as SessionUser }
  } catch {
    return null
  }
}

// For use in API routes / middleware via request
export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = await verify(token)
  if (!payload) return null
  return { user: payload as SessionUser }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 7,
    path: '/',
  })
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE)
}

// Drop-in replacement for auth() from next-auth
export async function auth(): Promise<Session | null> {
  return getSession()
}
