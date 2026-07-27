/**
 * Unit tests for the in-memory rate limiter logic used in
 * src/app/api/[...path]/route.ts
 *
 * We test the pure rate-limiting mechanics in isolation by re-implementing
 * the same Map-based algorithm and exercising it directly — this lets us
 * run fast, deterministic tests without spinning up Next.js.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ─── Inline implementation (mirrors route.ts exactly) ─────────────────────────

const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW_MS = 60_000

interface RateEntry {
  count: number
  resetAt: number
}

function createRateLimiter() {
  const map = new Map<string, RateEntry>()

  function check(
    ip: string,
    now: number,
  ): { allowed: boolean; count: number; resetAt: number; retryAfter?: number } {
    const entry = map.get(ip)

    if (!entry || now >= entry.resetAt) {
      map.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
      return { allowed: true, count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    }

    entry.count += 1

    if (entry.count > RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      return { allowed: false, count: entry.count, resetAt: entry.resetAt, retryAfter }
    }

    return { allowed: true, count: entry.count, resetAt: entry.resetAt }
  }

  function getEntry(ip: string): RateEntry | undefined {
    return map.get(ip)
  }

  function clear() {
    map.clear()
  }

  return { check, getEntry, clear, map }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Rate limiter — window calculation', () => {
  it('sets resetAt exactly RATE_LIMIT_WINDOW_MS in the future on first request', () => {
    const rl = createRateLimiter()
    const now = 1_000_000
    const result = rl.check('1.2.3.4', now)
    expect(result.resetAt).toBe(now + RATE_LIMIT_WINDOW_MS)
  })

  it('reuses the same window for subsequent requests within the window', () => {
    const rl = createRateLimiter()
    const now = 1_000_000
    rl.check('1.2.3.4', now)
    const result = rl.check('1.2.3.4', now + 5_000)
    // resetAt was set at `now`, so window ends at now + 60_000
    expect(result.resetAt).toBe(now + RATE_LIMIT_WINDOW_MS)
  })
})

describe('Rate limiter — request counting per IP', () => {
  it('starts at count 1 for the very first request', () => {
    const rl = createRateLimiter()
    const result = rl.check('10.0.0.1', Date.now())
    expect(result.count).toBe(1)
  })

  it('increments count on each subsequent request within the window', () => {
    const rl = createRateLimiter()
    const now = 2_000_000
    for (let i = 1; i <= 50; i++) {
      const r = rl.check('10.0.0.2', now + i * 100)
      expect(r.count).toBe(i)
    }
  })

  it('allows exactly RATE_LIMIT_MAX requests before blocking', () => {
    const rl = createRateLimiter()
    const now = 3_000_000
    let lastAllowed: ReturnType<typeof rl.check> | null = null
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      lastAllowed = rl.check('10.0.0.3', now)
    }
    expect(lastAllowed?.allowed).toBe(true)
    expect(lastAllowed?.count).toBe(RATE_LIMIT_MAX)
  })

  it('blocks the (RATE_LIMIT_MAX + 1)th request', () => {
    const rl = createRateLimiter()
    const now = 4_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      rl.check('10.0.0.4', now)
    }
    const blocked = rl.check('10.0.0.4', now)
    expect(blocked.allowed).toBe(false)
  })
})

describe('Rate limiter — reset after window expires', () => {
  it('resets count to 1 after the window has expired', () => {
    const rl = createRateLimiter()
    const now = 5_000_000
    // Exhaust limit
    for (let i = 0; i < RATE_LIMIT_MAX + 5; i++) {
      rl.check('10.0.0.5', now)
    }
    // Move past the window
    const afterReset = now + RATE_LIMIT_WINDOW_MS + 1
    const result = rl.check('10.0.0.5', afterReset)
    expect(result.allowed).toBe(true)
    expect(result.count).toBe(1)
  })

  it('creates a fresh window after reset, expiring WINDOW_MS later', () => {
    const rl = createRateLimiter()
    const now = 6_000_000
    rl.check('10.0.0.6', now)
    const afterReset = now + RATE_LIMIT_WINDOW_MS + 1
    const result = rl.check('10.0.0.6', afterReset)
    expect(result.resetAt).toBe(afterReset + RATE_LIMIT_WINDOW_MS)
  })
})

describe('Rate limiter — 429 response format', () => {
  it('returns retryAfter in seconds rounded up', () => {
    const rl = createRateLimiter()
    const now = 7_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      rl.check('10.0.0.7', now)
    }
    // 45 seconds into the window
    const t = now + 45_000
    // Need a fresh limiter entry at this timestamp
    const rl2 = createRateLimiter()
    // Pre-fill to just below limit at time `now`
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      rl2.check('10.0.0.7', now)
    }
    const blocked = rl2.check('10.0.0.7', now + 45_000)
    // Window ends at now + 60_000; we're at now + 45_000 → 15s remaining
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(15)
  })

  it('blocked response includes retryAfter > 0', () => {
    const rl = createRateLimiter()
    const now = 8_000_000
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      rl.check('10.0.0.8', now)
    }
    const entry = rl.getEntry('10.0.0.8')!
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })
})

describe('Rate limiter — different IPs have separate limits', () => {
  it('does not share state between two different IPs', () => {
    const rl = createRateLimiter()
    const now = 9_000_000
    // Exhaust IP A
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      rl.check('192.168.1.1', now)
    }
    // IP B should still be at count 1
    const resultB = rl.check('192.168.1.2', now)
    expect(resultB.allowed).toBe(true)
    expect(resultB.count).toBe(1)
  })

  it('each IP has its own independent window and count', () => {
    const rl = createRateLimiter()
    const now = 10_000_000
    const ips = ['10.1.1.1', '10.1.1.2', '10.1.1.3']
    // Make different numbers of requests per IP
    ips.forEach((ip, i) => {
      for (let j = 0; j <= i * 10; j++) {
        rl.check(ip, now)
      }
    })
    expect(rl.getEntry('10.1.1.1')?.count).toBe(1)
    expect(rl.getEntry('10.1.1.2')?.count).toBe(11)
    expect(rl.getEntry('10.1.1.3')?.count).toBe(21)
  })
})
