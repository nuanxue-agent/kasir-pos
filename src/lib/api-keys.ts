// Pure logic for API key management — no DB/Next.js deps

import { randomBytes, createHash } from 'crypto'

export const VALID_SCOPES = [
  'orders:read',
  'orders:write',
  'products:read',
  'products:write',
  'customers:read',
  'customers:write',
  'reports:read',
  'webhooks:read',
  'webhooks:write',
] as const

export type ApiKeyScope = (typeof VALID_SCOPES)[number]

export const VALID_WEBHOOK_EVENTS = [
  'order.created',
  'payment.received',
  'stock.low',
  'order.paid',
  'product.low_stock',
  'customer.created',
] as const

export type WebhookEvent = (typeof VALID_WEBHOOK_EVENTS)[number]

export interface ApiKeyData {
  id: string
  storeId: string
  name: string
  keyHash: string
  keyPrefix: string
  scopes: ApiKeyScope[]
  lastUsedAt: string | null
  expiresAt: string | null
  active: boolean
  createdBy: string
  createdAt: string
}

export interface WebhookData {
  id: string
  storeId: string
  url: string
  events: WebhookEvent[]
  secret: string
  active: boolean
  lastTriggeredAt: string | null
  createdAt: string
}

export interface WebhookLogData {
  id: string
  webhookId: string
  storeId: string
  event: string
  payload: Record<string, unknown>
  status: 'SUCCESS' | 'FAILED'
  responseCode: number | null
  createdAt: string
}

// ── Key generation ────────────────────────────────────────────────────────────

/** Generate a raw API key: ksr_live_<32 random hex bytes> */
export function generateRawApiKey(): string {
  return 'ksr_live_' + randomBytes(32).toString('hex')
}

/** Extract the prefix (first 16 chars of the key) for display */
export function extractKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 16)
}

/** Hash a raw API key with SHA-256 for storage */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

// ── Scope validation ──────────────────────────────────────────────────────────

/** Returns true if every scope in the list is a valid known scope */
export function validateScopes(scopes: string[]): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) return false
  return scopes.every(s => VALID_SCOPES.includes(s as ApiKeyScope))
}

/** Filter a scope list to only valid scopes */
export function filterValidScopes(scopes: string[]): ApiKeyScope[] {
  return scopes.filter((s): s is ApiKeyScope => VALID_SCOPES.includes(s as ApiKeyScope))
}

// ── Expiry ────────────────────────────────────────────────────────────────────

/** Returns true if the key is expired (expiresAt is in the past) */
export function isKeyExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < now
}

/** Returns true if the key is usable: active AND not expired */
export function isKeyActive(key: { active: boolean; expiresAt: string | null }, now = new Date()): boolean {
  return key.active && !isKeyExpired(key.expiresAt, now)
}

// ── Webhook event filtering ───────────────────────────────────────────────────

/** Filter an events list to only valid webhook events */
export function filterValidWebhookEvents(events: string[]): WebhookEvent[] {
  return events.filter((e): e is WebhookEvent =>
    VALID_WEBHOOK_EVENTS.includes(e as WebhookEvent),
  )
}

/** Returns true if all events in the list are valid */
export function validateWebhookEvents(events: string[]): boolean {
  if (!Array.isArray(events) || events.length === 0) return false
  return events.every(e => VALID_WEBHOOK_EVENTS.includes(e as WebhookEvent))
}

/** Get webhooks that listen to a specific event */
export function getWebhooksForEvent(webhooks: WebhookData[], event: WebhookEvent): WebhookData[] {
  return webhooks.filter(w => w.active && w.events.includes(event))
}

// ── Log aggregation ───────────────────────────────────────────────────────────

export interface LogStatusSummary {
  total: number
  success: number
  failed: number
  successRate: number
}

/** Aggregate webhook log entries into a status summary */
export function aggregateLogStatus(logs: Pick<WebhookLogData, 'status'>[]): LogStatusSummary {
  const total = logs.length
  if (total === 0) return { total: 0, success: 0, failed: 0, successRate: 0 }
  const success = logs.filter(l => l.status === 'SUCCESS').length
  const failed = total - success
  const successRate = Math.round((success / total) * 100)
  return { total, success, failed, successRate }
}

/** Get most recent log entries for a webhook */
export function getRecentLogs(logs: WebhookLogData[], limit = 10): WebhookLogData[] {
  return [...logs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}
