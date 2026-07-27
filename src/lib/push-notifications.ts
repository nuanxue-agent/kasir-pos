/**
 * Web Push / VAPID helpers
 *
 * VAPID key generation is intentionally a stub here — real key generation
 * requires the `web-push` npm package (server-side) or the Web Crypto API
 * (browser). In production, run `npx web-push generate-vapid-keys` and store
 * the results in environment variables.
 */

// ── VAPID key stubs ────────────────────────────────────────────────────────────
// Replace with real keys from: npx web-push generate-vapid-keys
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''

export const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@kasirapp.com'

/**
 * Stub for server-side VAPID key generation.
 * In production replace this with:
 *   import webpush from 'web-push'
 *   const keys = webpush.generateVAPIDKeys()
 */
export function generateVAPIDKeyStub(): { publicKey: string; privateKey: string } {
  // This would normally call web-push.generateVAPIDKeys()
  // Run in your terminal: npx web-push generate-vapid-keys --json
  throw new Error(
    'VAPID key generation requires the web-push package. ' +
      'Run: npx web-push generate-vapid-keys --json ' +
      'then set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env',
  )
}

// ── Subscription helpers ───────────────────────────────────────────────────────

export interface PushSubscriptionPayload {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Convert a browser PushSubscription to our serialisable payload shape.
 */
export function serializePushSubscription(sub: PushSubscription): PushSubscriptionPayload {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid PushSubscription: missing required fields')
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  }
}

/**
 * Validate a push subscription payload before storing it.
 */
export function validatePushSubscription(payload: unknown): payload is PushSubscriptionPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (typeof p.endpoint !== 'string' || !p.endpoint.startsWith('https://')) return false
  if (!p.keys || typeof p.keys !== 'object') return false
  const keys = p.keys as Record<string, unknown>
  if (typeof keys.p256dh !== 'string' || keys.p256dh.length < 10) return false
  if (typeof keys.auth !== 'string' || keys.auth.length < 4) return false
  return true
}

/**
 * Register the service worker and request a push subscription.
 * Call this from a client component after user grants permission.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const registration = await navigator.serviceWorker.ready

  // Check for existing subscription first
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    })
    return subscription
  } catch {
    return null
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return true
  return subscription.unsubscribe()
}

/**
 * Convert a URL-safe base64 string to a Uint8Array (needed by PushManager.subscribe).
 */
export function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}
