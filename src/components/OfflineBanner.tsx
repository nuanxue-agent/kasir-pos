'use client'

import { useEffect } from 'react'

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

export async function queueTransaction(tx: Omit<QueuedTransaction, 'id' | 'timestamp' | 'retries'>): Promise<string> {
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
  let synced = 0; let failed = 0
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
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed silently — not critical
      })
    }

    // Sync on reconnect
    function handleOnline() {
      syncPendingTransactions().then(({ synced }) => {
        if (synced > 0) {
          console.log(`[Lakoo] Synced ${synced} offline transactions`)
        }
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // Render nothing — banner is shown via CSS media query / event listeners
  return null
}
