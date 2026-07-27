const CACHE_VERSION = 'v2'
const STATIC_CACHE = `lakoo-static-${CACHE_VERSION}`
const API_CACHE = `lakoo-api-${CACHE_VERSION}`
const PAGE_CACHE = `lakoo-pages-${CACHE_VERSION}`

const APP_SHELL = [
  '/login',
  '/dashboard',
  '/dashboard/pos',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
]

// ── IndexedDB offline queue ────────────────────────────────────────────────────

const IDB_NAME = 'lakoo-offline'
const IDB_VERSION = 1
const STORE_QUEUE = 'tx_queue'

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
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

async function enqueueRequest(request) {
  const body = await request.clone().text()
  const db = await openIDB()
  const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readwrite')
    txn.objectStore(STORE_QUEUE).put({
      id,
      url: request.url,
      method: request.method,
      body,
      timestamp: Date.now(),
      retries: 0,
    })
    txn.oncomplete = () => resolve(id)
    txn.onerror = () => reject(txn.error)
  })
}

async function getPendingQueue() {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readonly')
    const req = txn.objectStore(STORE_QUEUE).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  })
}

async function removeFromQueue(id) {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_QUEUE, 'readwrite')
    txn.objectStore(STORE_QUEUE).delete(id)
    txn.oncomplete = () => resolve()
    txn.onerror = () => reject(txn.error)
  })
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Add each shell item individually — skip if fetch fails (icon may not exist)
        return Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, API_CACHE, PAGE_CACHE]
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => !currentCaches.includes(k))
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (!url.protocol.startsWith('http')) return

  // ── Mutating requests (POST / PATCH / PUT / DELETE) ─────────────────────────
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          // Offline: queue for later sync
          await enqueueRequest(request)
          // Notify all clients about the new queued item
          const clients = await self.clients.matchAll()
          clients.forEach(c => c.postMessage({ type: 'QUEUE_UPDATED' }))
          return new Response(
            JSON.stringify({ queued: true, offline: true }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
          )
        })
      )
    }
    return
  }

  // ── Static assets: cache-first ───────────────────────────────────────────────
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // ── API GET requests: network-first with cache fallback ──────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(API_CACHE).then(c => c.put(request, clone))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ??
            new Response(
              JSON.stringify({ error: 'Offline', offline: true }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    )
    return
  }

  // ── Pages: stale-while-revalidate ────────────────────────────────────────────
  event.respondWith(
    caches.open(PAGE_CACHE).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone())
          return res
        }).catch(() => cached ?? new Response('Offline', { status: 503 }))

        // Return cached immediately; revalidate in background
        return cached ?? networkFetch
      })
    )
  )
})

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(replayOfflineQueue())
  }
})

async function replayOfflineQueue() {
  const pending = await getPendingQueue()
  let synced = 0
  let failed = 0

  for (const tx of pending) {
    try {
      const res = await fetch(tx.url, {
        method: tx.method,
        headers: { 'Content-Type': 'application/json' },
        body: tx.body || undefined,
      })
      if (res.ok) {
        await removeFromQueue(tx.id)
        synced++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  // Notify clients about sync result
  const clients = await self.clients.matchAll()
  clients.forEach(c =>
    c.postMessage({ type: 'SYNC_COMPLETE', synced, failed, timestamp: Date.now() })
  )

  return { synced, failed }
}

// ── Message handler (manual sync trigger from UI) ─────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'TRIGGER_SYNC') {
    replayOfflineQueue().then(result => {
      event.source?.postMessage({ type: 'SYNC_COMPLETE', ...result, timestamp: Date.now() })
    })
  }
  if (event.data?.type === 'GET_QUEUE_COUNT') {
    getPendingQueue().then(q => {
      event.source?.postMessage({ type: 'QUEUE_COUNT', count: q.length })
    })
  }
})
