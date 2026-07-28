import { describe, it, expect } from 'vitest'
import {
  formatFileSize,
  isExpiringSoon,
  isExpired,
  parseTags,
  filterDocuments,
  validateDocumentType,
  type Document,
  type DocumentType,
} from '@/components/documents/DocumentClient'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    storeId: 'store-1',
    name: 'Contract 2025.pdf',
    type: 'CONTRACT',
    url: '/files/contract.pdf',
    size: 204800,
    uploadedBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    expiresAt: null,
    tags: ['kontrak', 'vendor'],
    ...overrides,
  }
}

// ── 1. isExpiringSoon — expires within 30 days ────────────────────────────────

it('isExpiringSoon returns true when expiry is 10 days away', () => {
  const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
  expect(isExpiringSoon(soon)).toBe(true)
})

it('isExpiringSoon returns false when expiry is 60 days away', () => {
  const far = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  expect(isExpiringSoon(far)).toBe(false)
})

it('isExpiringSoon returns false for null expiresAt', () => {
  expect(isExpiringSoon(null)).toBe(false)
})

// ── 2. isExpired ──────────────────────────────────────────────────────────────

it('isExpired returns true for a past date', () => {
  expect(isExpired('2020-01-01T00:00:00.000Z')).toBe(true)
})

it('isExpired returns false for a future date', () => {
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  expect(isExpired(future)).toBe(false)
})

// ── 3. parseTags ──────────────────────────────────────────────────────────────

it('parseTags parses comma-separated string', () => {
  expect(parseTags('kontrak, vendor, 2025')).toEqual(['kontrak', 'vendor', '2025'])
})

it('parseTags handles array input', () => {
  expect(parseTags(['kontrak', ' vendor '])).toEqual(['kontrak', 'vendor'])
})

it('parseTags filters empty entries', () => {
  expect(parseTags('a,,b, ')).toEqual(['a', 'b'])
})

// ── 4. formatFileSize ─────────────────────────────────────────────────────────

it('formatFileSize formats bytes', () => {
  expect(formatFileSize(512)).toBe('512 B')
})

it('formatFileSize formats kilobytes', () => {
  expect(formatFileSize(2048)).toBe('2.0 KB')
})

it('formatFileSize formats megabytes', () => {
  expect(formatFileSize(1048576)).toBe('1.0 MB')
})

// ── 5. validateDocumentType ───────────────────────────────────────────────────

it('validateDocumentType accepts valid types', () => {
  const valid: string[] = ['CONTRACT', 'INVOICE', 'RECEIPT', 'REPORT', 'OTHER']
  valid.forEach(t => expect(validateDocumentType(t)).toBe(true))
})

it('validateDocumentType rejects invalid type', () => {
  expect(validateDocumentType('UNKNOWN')).toBe(false)
  expect(validateDocumentType('')).toBe(false)
})

// ── 6. filterDocuments ────────────────────────────────────────────────────────

describe('filterDocuments', () => {
  const docs: Document[] = [
    makeDoc({ id: '1', name: 'Contract 2025', type: 'CONTRACT', tags: ['vendor'] }),
    makeDoc({ id: '2', name: 'Invoice March', type: 'INVOICE', tags: ['billing'] }),
    makeDoc({ id: '3', name: 'Receipt Q1', type: 'RECEIPT', tags: ['vendor', 'q1'] }),
  ]

  it('returns all docs with empty filters', () => {
    expect(filterDocuments(docs, '', '', '')).toHaveLength(3)
  })

  it('filters by type', () => {
    const result = filterDocuments(docs, '', 'INVOICE', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by search term in name', () => {
    const result = filterDocuments(docs, 'march', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by tag', () => {
    const result = filterDocuments(docs, '', '', 'vendor')
    expect(result).toHaveLength(2)
  })

  it('combines type and search filters', () => {
    const result = filterDocuments(docs, 'q1', 'RECEIPT', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })
})
