// Pure business logic for offline sync queue — no DB or Next.js imports

export type SyncAction =
  | 'CREATE_ORDER'
  | 'UPDATE_ORDER'
  | 'UPDATE_STOCK'
  | 'CREATE_CUSTOMER'

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export type ConflictType =
  | 'VERSION_MISMATCH'
  | 'DELETED_ON_SERVER'
  | 'CONCURRENT_UPDATE'

export interface SyncQueueItem {
  id: string
  storeId: string
  action: SyncAction
  payload: Record<string, unknown>
  status: SyncStatus
  createdAt: string
  syncedAt: string | null
  retryCount: number
}

export interface SyncConflict {
  id: string
  syncQueueId: string
  storeId: string
  conflictType: ConflictType
  localData: Record<string, unknown>
  serverData: Record<string, unknown>
  resolved: boolean
  resolvedAt: string | null
}

// ── Status transitions ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<SyncStatus, SyncStatus[]> = {
  PENDING: ['SYNCED', 'FAILED'],
  SYNCED: [],
  FAILED: ['PENDING'],
}

export function isValidSyncStatusTransition(from: SyncStatus, to: SyncStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ── Retry logic ────────────────────────────────────────────────────────────

export const MAX_RETRY_COUNT = 3

export function canRetry(item: SyncQueueItem): boolean {
  return item.status === 'FAILED' && item.retryCount < MAX_RETRY_COUNT
}

export function incrementRetry(item: SyncQueueItem): SyncQueueItem {
  return { ...item, retryCount: item.retryCount + 1, status: 'PENDING' }
}

// ── FIFO ordering ──────────────────────────────────────────────────────────

export function sortFIFO(items: SyncQueueItem[]): SyncQueueItem[] {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export function getPendingFIFO(items: SyncQueueItem[]): SyncQueueItem[] {
  return sortFIFO(items.filter((i) => i.status === 'PENDING'))
}

// ── Payload serialization ──────────────────────────────────────────────────

export function serializePayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
}

export function deserializePayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ── Conflict detection ─────────────────────────────────────────────────────

export function detectConflictType(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown> | null,
): ConflictType {
  if (serverData === null) return 'DELETED_ON_SERVER'
  const localVersion = localData.version as number | undefined
  const serverVersion = serverData.version as number | undefined
  if (localVersion !== undefined && serverVersion !== undefined && localVersion !== serverVersion) {
    return 'VERSION_MISMATCH'
  }
  return 'CONCURRENT_UPDATE'
}

export function hasConflict(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown> | null,
): boolean {
  if (serverData === null) return true
  const localUpdatedAt = localData.updatedAt as string | undefined
  const serverUpdatedAt = serverData.updatedAt as string | undefined
  if (localUpdatedAt && serverUpdatedAt && localUpdatedAt !== serverUpdatedAt) return true
  const localVersion = localData.version as number | undefined
  const serverVersion = serverData.version as number | undefined
  if (localVersion !== undefined && serverVersion !== undefined && localVersion !== serverVersion)
    return true
  return false
}

// ── Stats helpers ──────────────────────────────────────────────────────────

export interface SyncStats {
  total: number
  pending: number
  synced: number
  failed: number
  pendingConflicts: number
}

export function calcSyncStats(
  items: SyncQueueItem[],
  conflicts: SyncConflict[],
): SyncStats {
  return {
    total: items.length,
    pending: items.filter((i) => i.status === 'PENDING').length,
    synced: items.filter((i) => i.status === 'SYNCED').length,
    failed: items.filter((i) => i.status === 'FAILED').length,
    pendingConflicts: conflicts.filter((c) => !c.resolved).length,
  }
}
