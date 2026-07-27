'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Offline transaction queue using IndexedDB ─────────────────────────────────

const DB_NAME = 'lakoo-offline'
const DB_VERSION = 1
const STORE_QUEUE = 'tx_queue'

interface QueuedTransaction {
  id: string
  url: string
  method: string
  body: string
  storeId: string
  timestamp: number
  retries: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function queueTransaction(
  tx: Omit<QueuedTransaction, 'id' | 'timestamp' | 'retries'>
): Promise<string> {
  const db = await openDB()
  const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const full: QueuedTransaction = { ...tx, id, timestamp: Date.now(), retries: 0 }
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readwrite')
    txn.objectStore(STORE_QUEUE).put(full)
    txn.oncomplete = () => resolve(id)
    txn.onerror = () => reject(txn.error)
  })
}

export async function getPendingTransactions(): Promise<QueuedTransaction[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readonly')
    const req = txn.objectStore(STORE_QUEUE).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function removeTransaction(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readwrite')
    txn.objectStore(STORE_QUEUE).delete(id)
    txn.oncomplete = () => resolve()
    txn.onerror = () => reject(txn.error)
  })
}

export async function syncPendingTransactions(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingTransactions()
  let synced = 0
  let failed = 0
  for (const tx of pending) {
    try {
      const res = await fetch(tx.url, {
        method: tx.method,
        headers: { 'Content-Type': 'application/json' },
        body: tx.body,
      })
      if (res.ok) {
        await removeTransaction(tx.id)
        synced++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }
  return { synced, failed }
}

// ── Offline status hook ───────────────────────────────────────────────────────

export function useOnlineStatus(): boolean {
  if (typeof window === 'undefined') return true
  return navigator.onLine
}

// ── Offline banner component ──────────────────────────────────────────────────

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Refresh pending count from IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingTransactions()
      setPendingCount(pending.length)
    } catch {
      // IDB not available yet
    }
  }, [])

  // Manual sync trigger
  const handleSyncNow = useCallback(async () => {
    if (!isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      // Prefer triggering via SW so it can update its own state
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' })
      } else {
        const { synced } = await syncPendingTransactions()
        if (synced > 0) {
          setLastSyncTime(new Date())
          await refreshPendingCount()
        }
      }
    } catch {
      // Sync attempt failed silently
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, refreshPendingCount])

  useEffect(() => {
    // Initialise online state from navigator
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed silently — not critical
      })

      // Listen for messages from SW
      const handleSWMessage = (event: MessageEvent) => {
        const { data } = event
        if (data?.type === 'SYNC_COMPLETE') {
          setLastSyncTime(new Date(data.timestamp))
          refreshPendingCount()
          setIsSyncing(false)
        }
        if (data?.type === 'QUEUE_UPDATED') {
          refreshPendingCount()
        }
        if (data?.type === 'QUEUE_COUNT') {
          setPendingCount(data.count)
        }
      }
      navigator.serviceWorker.addEventListener('message', handleSWMessage)
    }

    // Poll pending count once on mount
    refreshPendingCount()

    function handleOnline() {
      setIsOnline(true)
      // Auto-sync when back online
      syncPendingTransactions().then(({ synced }) => {
        if (synced > 0) {
          setLastSyncTime(new Date())
          console.log(`[Lakoo] Synced ${synced} offline transactions`)
        }
        refreshPendingCount()
      })
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPendingCount])

  // Nothing to show when online and no pending items
  if (isOnline && pendingCount === 0) return null

  const hasPending = pendingCount > 0
  const bannerColor = hasPending
    ? 'bg-amber-50 border-amber-300 text-amber-900'
    : 'bg-green-50 border-green-300 text-green-900'
  const dotColor = hasPending ? 'bg-amber-500' : 'bg-green-500'
  const buttonColor = hasPending
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : 'bg-green-500 hover:bg-green-600 text-white'

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-50 border-b px-4 py-2 flex items-center justify-between gap-3 text-sm ${bannerColor}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
        <span className="font-medium truncate">
          {!isOnline ? 'You are offline' : 'Back online'}
          {hasPending && ` — ${pendingCount} pending transaction${pendingCount !== 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {lastSyncTime && (
          <span className="hidden sm:block text-xs opacity-70">
            Last sync: {formatTime(lastSyncTime)}
          </span>
        )}
        {isOnline && hasPending && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors disabled:opacity-60 ${buttonColor}`}
          >
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </div>
  )
}
