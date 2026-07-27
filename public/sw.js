const CACHE_VERSION = 'v1'
const STATIC_CACHE = `lakoo-static-${CACHE_VERSION}`
const API_CACHE = `lakoo-api-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/dashboard/pos',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and non-http(s) requests
  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // API calls: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(API_CACHE).then(cache => cache.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request).then(cached => cached ?? new Response(
          JSON.stringify({ error: 'Offline', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )))
    )
    return
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone))
        }
        return res
      })
    })
  )
})

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncOfflineTransactions())
  }
})

async function syncOfflineTransactions() {
  const clients = await self.clients.matchAll()
  clients.forEach(client => client.postMessage({ type: 'SYNC_TRANSACTIONS' }))
}
