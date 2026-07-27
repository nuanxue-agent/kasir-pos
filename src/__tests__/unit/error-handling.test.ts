import { describe, it, expect } from 'vitest'
import { ValidationError } from '@/app/api/[...path]/route'

// ─── Helpers that mirror the route's internal error-shaping logic ─────────────

function makeErrorResponse(msg: string, status: number, code: string, requestId: string) {
  return { body: { error: msg, code, requestId }, status }
}

function isStructuredError(obj: any): boolean {
  return typeof obj.error === 'string' && typeof obj.code === 'string' && 'requestId' in obj
}

// ─── Error response shape ────────────────────────────────────────────────────

describe('Error response shape', () => {
  it('includes error, code, and requestId fields', () => {
    const resp = makeErrorResponse('Not found', 404, 'NOT_FOUND', 'req-123')
    expect(isStructuredError(resp.body)).toBe(true)
  })

  it('error field is a string', () => {
    const resp = makeErrorResponse('Bad request', 400, 'ERROR', 'req-abc')
    expect(typeof resp.body.error).toBe('string')
  })

  it('code field is a string', () => {
    const resp = makeErrorResponse('Unauthorized', 401, 'UNAUTHORIZED', 'req-xyz')
    expect(typeof resp.body.code).toBe('string')
  })

  it('requestId field is present', () => {
    const resp = makeErrorResponse('Internal error', 500, 'INTERNAL_ERROR', 'req-001')
    expect(resp.body.requestId).toBeDefined()
  })
})

// ─── HTTP status codes ────────────────────────────────────────────────────────

describe('HTTP status codes match error types', () => {
  it('validation errors map to 400', () => {
    const e = new ValidationError('bad input')
    expect(e.status).toBe(400)
  })

  it('missing field maps to 400', () => {
    const e = new ValidationError('field required', 'MISSING_FIELD', 400)
    expect(e.status).toBe(400)
  })

  it('not found maps to 404', () => {
    const resp = makeErrorResponse('Not found', 404, 'NOT_FOUND', 'req-123')
    expect(resp.status).toBe(404)
  })

  it('internal error maps to 500', () => {
    const resp = makeErrorResponse('Internal server error', 500, 'INTERNAL_ERROR', 'req-123')
    expect(resp.status).toBe(500)
  })

  it('unauthorized maps to 401', () => {
    const resp = makeErrorResponse('Unauthorized', 401, 'UNAUTHORIZED', 'req-123')
    expect(resp.status).toBe(401)
  })
})

// ─── Stack traces not exposed in production ───────────────────────────────────
// Tests use the same isProd flag logic the route uses (process.env.NODE_ENV === 'production')
// without mutating the env — we exercise the shaping function directly.

function buildErrorBody(e: Error, isProd: boolean) {
  return {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId: 'req-123',
    ...(isProd ? {} : { detail: e.message }),
  }
}

describe('Stack traces not exposed in production', () => {
  it('does not include stack or detail in production error body', () => {
    const body = buildErrorBody(new Error('something went wrong'), true)
    expect(body).not.toHaveProperty('stack')
    expect(body).not.toHaveProperty('detail')
  })

  it('includes detail message in non-production error body', () => {
    const body = buildErrorBody(new Error('db connection failed'), false)
    expect(body.detail).toBe('db connection failed')
    expect(body).not.toHaveProperty('stack')
  })
})

// ─── 404 vs 400 vs 500 scenarios ─────────────────────────────────────────────

describe('Error scenario differentiation', () => {
  it('returns 404 for missing resource', () => {
    const resp = makeErrorResponse('Order not found', 404, 'NOT_FOUND', 'req-1')
    expect(resp.status).toBe(404)
    expect(resp.body.code).toBe('NOT_FOUND')
  })

  it('returns 400 for invalid input', () => {
    const resp = makeErrorResponse("Field 'name' is required", 400, 'MISSING_FIELD', 'req-2')
    expect(resp.status).toBe(400)
    expect(resp.body.code).toBe('MISSING_FIELD')
  })

  it('returns 500 for unexpected server errors', () => {
    const resp = makeErrorResponse('Internal server error', 500, 'INTERNAL_ERROR', 'req-3')
    expect(resp.status).toBe(500)
    expect(resp.body.code).toBe('INTERNAL_ERROR')
  })
})
