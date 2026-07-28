import { describe, it, expect } from 'vitest'
import {
  isValidSyncStatusTransition,
  canRetry,
  sortFIFO,
  getPendingFIFO,
  serializePayload,
  deserializePayload,
  detectConflictType,
  hasConflict,
  calcSyncStats,
  incrementRetry,
  MAX_RETRY_COUNT,
  type SyncQueueItem,
  type SyncConflict,
} from '@/lib/offline-sync'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'item-1',
    storeId: 'store-1',
    action: 'CREATE_ORDER',
    payload: { orderId: 'ord-1' },
    status: 'PENDING',
    createdAt: '2026-07-28T10:00:00.000Z',
    syncedAt: null,
    retryCount: 0,
    ...overrides,
  }
}

function makeConflict(overrides: Partial<SyncConflict> = {}): SyncConflict {
  return {
    id: 'conflict-1',
    syncQueueId: 'item-1',
    storeId: 'store-1',
    conflictType: 'VERSION_MISMATCH',
    localData: { id: 'obj-1', version: 2, updatedAt: '2026-07-28T10:00:00.000Z' },
    serverData: { id: 'obj-1', version: 3, updatedAt: '2026-07-28T09:00:00.000Z' },
    resolved: false,
    resolvedAt: null,
    ...overrides,
  }
}

// ── 1. FIFO ordering ─────────────────────────────────────────────────────────

describe('FIFO ordering', () => {
  it('should sort items by createdAt ascending', () => {
    const items: SyncQueueItem[] = [
      makeItem({ id: 'c', createdAt: '2026-07-28T12:00:00.000Z' }),
      makeItem({ id: 'a', createdAt: '2026-07-28T10:00:00.000Z' }),
      makeItem({ id: 'b', createdAt: '2026-07-28T11:00:00.000Z' }),
    ]
    const sorted = sortFIFO(items)
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('getPendingFIFO should return only PENDING items in order', () => {
    const items: SyncQueueItem[] = [
      makeItem({ id: 'x', status: 'SYNCED', createdAt: '2026-07-28T09:00:00.000Z' }),
      makeItem({ id: 'c', status: 'PENDING', createdAt: '2026-07-28T12:00:00.000Z' }),
      makeItem({ id: 'a', status: 'PENDING', createdAt: '2026-07-28T10:00:00.000Z' }),
      makeItem({ id: 'b', status: 'FAILED', createdAt: '2026-07-28T11:00:00.000Z' }),
    ]
    const result = getPendingFIFO(items)
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

// ── 2. Retry count logic ─────────────────────────────────────────────────────

describe('Retry count logic', () => {
  it('canRetry should return true for FAILED item below max retries', () => {
    const item = makeItem({ status: 'FAILED', retryCount: 0 })
    expect(canRetry(item)).toBe(true)
  })

  it('canRetry should return false when retryCount reaches MAX_RETRY_COUNT', () => {
    const item = makeItem({ status: 'FAILED', retryCount: MAX_RETRY_COUNT })
    expect(canRetry(item)).toBe(false)
  })

  it('canRetry should return false for non-FAILED items', () => {
    expect(canRetry(makeItem({ status: 'PENDING', retryCount: 0 }))).toBe(false)
    expect(canRetry(makeItem({ status: 'SYNCED', retryCount: 0 }))).toBe(false)
  })

  it('incrementRetry should increment retryCount and set status to PENDING', () => {
    const item = makeItem({ status: 'FAILED', retryCount: 1 })
    const updated = incrementRetry(item)
    expect(updated.retryCount).toBe(2)
    expect(updated.status).toBe('PENDING')
  })

  it('should not mutate the original item on incrementRetry', () => {
    const item = makeItem({ status: 'FAILED', retryCount: 0 })
    incrementRetry(item)
    expect(item.retryCount).toBe(0)
  })
})

// ── 3. Conflict detection ────────────────────────────────────────────────────

describe('Conflict detection', () => {
  it('hasConflict should return true when updatedAt timestamps differ', () => {
    const local = { id: 'o1', updatedAt: '2026-07-28T10:00:00.000Z' }
    const server = { id: 'o1', updatedAt: '2026-07-28T09:00:00.000Z' }
    expect(hasConflict(local, server)).toBe(true)
  })

  it('hasConflict should return true when serverData is null (deleted)', () => {
    expect(hasConflict({ id: 'o1' }, null)).toBe(true)
  })

  it('hasConflict should return false when data matches', () => {
    const ts = '2026-07-28T10:00:00.000Z'
    expect(hasConflict({ id: 'o1', updatedAt: ts }, { id: 'o1', updatedAt: ts })).toBe(false)
  })

  it('detectConflictType should return DELETED_ON_SERVER when serverData is null', () => {
    expect(detectConflictType({ id: 'o1' }, null)).toBe('DELETED_ON_SERVER')
  })

  it('detectConflictType should return VERSION_MISMATCH when versions differ', () => {
    expect(detectConflictType({ version: 2 }, { version: 3 })).toBe('VERSION_MISMATCH')
  })

  it('detectConflictType should return CONCURRENT_UPDATE as fallback', () => {
    expect(detectConflictType({ name: 'a' }, { name: 'b' })).toBe('CONCURRENT_UPDATE')
  })
})

// ── 4. Status transition validation ─────────────────────────────────────────

describe('Status transition validation', () => {
  it('PENDING → SYNCED should be valid', () => {
    expect(isValidSyncStatusTransition('PENDING', 'SYNCED')).toBe(true)
  })

  it('PENDING → FAILED should be valid', () => {
    expect(isValidSyncStatusTransition('PENDING', 'FAILED')).toBe(true)
  })

  it('FAILED → PENDING should be valid (retry)', () => {
    expect(isValidSyncStatusTransition('FAILED', 'PENDING')).toBe(true)
  })

  it('SYNCED → PENDING should be invalid (terminal)', () => {
    expect(isValidSyncStatusTransition('SYNCED', 'PENDING')).toBe(false)
  })

  it('SYNCED → FAILED should be invalid (terminal)', () => {
    expect(isValidSyncStatusTransition('SYNCED', 'FAILED')).toBe(false)
  })

  it('FAILED → SYNCED should be invalid (must go through PENDING)', () => {
    expect(isValidSyncStatusTransition('FAILED', 'SYNCED')).toBe(false)
  })
})

// ── 5. Payload serialization ─────────────────────────────────────────────────

describe('Payload serialization', () => {
  it('serializePayload should produce valid JSON string', () => {
    const payload = { orderId: 'ord-1', items: [{ id: 'i1', qty: 2 }], total: 50000 }
    const serialized = serializePayload(payload)
    expect(typeof serialized).toBe('string')
    expect(JSON.parse(serialized)).toEqual(payload)
  })

  it('deserializePayload should round-trip correctly', () => {
    const payload = { customerId: 'cust-1', name: 'Budi' }
    const raw = JSON.stringify(payload)
    expect(deserializePayload(raw)).toEqual(payload)
  })

  it('deserializePayload should return empty object for null/undefined', () => {
    expect(deserializePayload(null)).toEqual({})
    expect(deserializePayload(undefined)).toEqual({})
    expect(deserializePayload('')).toEqual({})
  })

  it('deserializePayload should return empty object for malformed JSON', () => {
    expect(deserializePayload('{bad json')).toEqual({})
  })
})

// ── 6. calcSyncStats ─────────────────────────────────────────────────────────

describe('calcSyncStats', () => {
  it('should compute correct counts across all statuses', () => {
    const items: SyncQueueItem[] = [
      makeItem({ id: '1', status: 'PENDING' }),
      makeItem({ id: '2', status: 'PENDING' }),
      makeItem({ id: '3', status: 'SYNCED' }),
      makeItem({ id: '4', status: 'FAILED' }),
    ]
    const conflicts: SyncConflict[] = [
      makeConflict({ id: 'c1', resolved: false }),
      makeConflict({ id: 'c2', resolved: true }),
    ]
    const stats = calcSyncStats(items, conflicts)
    expect(stats.total).toBe(4)
    expect(stats.pending).toBe(2)
    expect(stats.synced).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.pendingConflicts).toBe(1)
  })

  it('should return zeros for empty arrays', () => {
    const stats = calcSyncStats([], [])
    expect(stats).toEqual({ total: 0, pending: 0, synced: 0, failed: 0, pendingConflicts: 0 })
  })
})
