import { describe, it, expect, vi } from 'vitest'

// ── URL validation helpers ────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function buildQueryString(params: Record<string, string | number>): string {
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
}

function extractPathname(url: string): string {
  return new URL(url).pathname
}

// ── Test data factory functions ───────────────────────────────────────────────

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
}

interface CartItem {
  productId: string
  quantity: number
  price: number
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: `user-${Math.random().toString(36).slice(2, 9)}`,
    email: 'demo@lakoo.id',
    name: 'Demo User',
    role: 'cashier',
    ...overrides,
  }
}

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: `prod-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Test Product',
    price: 10000,
    stock: 100,
    ...overrides,
  }
}

function createCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: `prod-abc`,
    quantity: 1,
    price: 10000,
    ...overrides,
  }
}

// ── Mock response builders ────────────────────────────────────────────────────

function mockSuccessResponse<T>(data: T, status = 200) {
  return {
    ok: true,
    status,
    json: async () => data,
    headers: new Headers({ 'content-type': 'application/json' }),
  }
}

function mockErrorResponse(message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ error: message }),
    headers: new Headers({ 'content-type': 'application/json' }),
  }
}

// ── Wait condition helpers ────────────────────────────────────────────────────

async function waitFor(
  condition: () => boolean,
  { interval = 50, timeout = 1000 } = {}
): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (condition()) return true
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 10
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('URL validation helpers', () => {
  it('accepts a valid absolute URL', () => {
    expect(isValidUrl('http://localhost:3000/dashboard')).toBe(true)
  })

  it('rejects a relative URL', () => {
    expect(isValidUrl('/dashboard')).toBe(false)
  })

  it('builds a query string from params', () => {
    const qs = buildQueryString({ page: 1, q: 'apple' })
    expect(qs).toContain('page=1')
    expect(qs).toContain('q=apple')
  })

  it('extracts pathname from a URL', () => {
    expect(extractPathname('http://localhost:3000/dashboard/pos?tab=grid')).toBe(
      '/dashboard/pos'
    )
  })
})

describe('Test data factory functions', () => {
  it('createUser returns a user with defaults', () => {
    const user = createUser()
    expect(user.email).toBe('demo@lakoo.id')
    expect(user.role).toBe('cashier')
    expect(user.id).toMatch(/^user-/)
  })

  it('createUser applies overrides', () => {
    const user = createUser({ role: 'admin', email: 'admin@test.com' })
    expect(user.role).toBe('admin')
    expect(user.email).toBe('admin@test.com')
  })

  it('createProduct returns a product with defaults', () => {
    const product = createProduct()
    expect(product.price).toBe(10000)
    expect(product.stock).toBe(100)
    expect(product.id).toMatch(/^prod-/)
  })

  it('createCartItem returns a cart item with defaults', () => {
    const item = createCartItem({ quantity: 3 })
    expect(item.quantity).toBe(3)
    expect(item.price).toBe(10000)
  })
})

describe('Mock response builders', () => {
  it('mockSuccessResponse returns ok:true with data', async () => {
    const res = mockSuccessResponse({ id: 1, name: 'Test' })
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1, name: 'Test' })
  })

  it('mockErrorResponse returns ok:false with error message', async () => {
    const res = mockErrorResponse('Not found', 404)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})

describe('Wait condition helpers', () => {
  it('waitFor resolves true when condition passes immediately', async () => {
    const result = await waitFor(() => true)
    expect(result).toBe(true)
  })

  it('waitFor resolves true when condition passes after a delay', async () => {
    let ready = false
    setTimeout(() => { ready = true }, 50)
    const result = await waitFor(() => ready, { interval: 10, timeout: 500 })
    expect(result).toBe(true)
  })

  it('waitFor returns false on timeout', async () => {
    const result = await waitFor(() => false, { interval: 10, timeout: 50 })
    expect(result).toBe(false)
  })

  it('retryAsync succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryAsync(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retryAsync retries on failure and eventually succeeds', async () => {
    let attempts = 0
    const fn = vi.fn().mockImplementation(async () => {
      attempts++
      if (attempts < 3) throw new Error('not yet')
      return 'success'
    })
    const result = await retryAsync(fn, 3, 5)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
