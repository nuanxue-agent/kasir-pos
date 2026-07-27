// Webhook utilities: payload construction, signing, validation

import { createHmac, randomBytes } from 'crypto'

export type WebhookEvent = 'order.created' | 'order.paid' | 'product.low_stock' | 'customer.created'

export interface WebhookPayload {
  id: string
  event: string
  timestamp: string
  data: Record<string, unknown>
}

/** Build a canonical webhook payload envelope */
export function buildWebhookPayload(
  event: string,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    id: randomBytes(12).toString('hex'),
    event,
    timestamp: new Date().toISOString(),
    data,
  }
}

/** Generate a webhook secret (whsec_ prefix + 32 random bytes) */
export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(32).toString('hex')
}

/** Sign a webhook payload string with HMAC-SHA256 */
export function signWebhookPayload(payload: string, secret: string): string {
  const key = secret.startsWith('whsec_') ? secret.slice(6) : secret
  return createHmac('sha256', key).update(payload).digest('hex')
}

/** Verify an incoming webhook signature */
export function verifyWebhookSignature(
  payload: string,
  secret: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(payload, secret)
  if (expected.length !== signature.length) return false
  // Constant-time comparison
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/** Validate a webhook URL — must be http or https */
export function validateWebhookEndpointUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Filter events to only supported webhook events */
export const SUPPORTED_WEBHOOK_EVENTS: WebhookEvent[] = [
  'order.created',
  'order.paid',
  'product.low_stock',
  'customer.created',
]

export function filterValidEvents(events: string[]): WebhookEvent[] {
  return events.filter((e): e is WebhookEvent =>
    SUPPORTED_WEBHOOK_EVENTS.includes(e as WebhookEvent),
  )
}

/** Retry logic: should we retry based on response code / attempt number */
export function shouldRetryDelivery(
  responseCode: number | null,
  attemptNumber: number,
  maxAttempts = 3,
): boolean {
  if (attemptNumber >= maxAttempts) return false
  // Don't retry on client errors (4xx) — only on network failure or 5xx
  if (responseCode !== null && responseCode >= 400 && responseCode < 500) return false
  return true
}

/** Calculate retry delay with exponential backoff (ms) */
export function retryDelay(attemptNumber: number): number {
  return Math.min(1000 * Math.pow(2, attemptNumber), 30_000)
}
