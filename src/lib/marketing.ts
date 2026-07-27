// Marketing types and pure logic — no DB dependencies (safe to import in tests)

export type CampaignType = 'EMAIL' | 'SMS' | 'WHATSAPP'
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT'
export type AudienceType = 'ALL' | 'SEGMENT' | 'LOYALTY_TIER'

export interface Campaign {
  id: string
  storeId: string
  name: string
  type: CampaignType
  status: CampaignStatus
  message: string
  audience: AudienceType
  audienceValue?: string | null
  scheduledAt?: string | null
  sentCount: number
  createdAt: string
  updatedAt: string
}

// ─── Message templates ────────────────────────────────────────────────────────

export interface MessageTemplate {
  id: string
  name: string
  body: string
  type: CampaignType | 'ALL'
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'promo-akhir-bulan',
    name: 'Promo Akhir Bulan',
    type: 'ALL',
    body: 'Halo {name}! Jangan lewatkan promo akhir bulan kami. Belanja sekarang dan dapatkan diskon spesial!',
  },
  {
    id: 'selamat-ulang-tahun',
    name: 'Selamat Ulang Tahun',
    type: 'ALL',
    body: 'Selamat Ulang Tahun, {name}! Sebagai pelanggan {tier} kami, kami memberikan hadiah spesial untuk Anda.',
  },
  {
    id: 'poin-hampir-kadaluarsa',
    name: 'Poin Hampir Kadaluarsa',
    type: 'ALL',
    body: 'Hai {name}, poin loyalitas Anda ({points} poin) akan segera kadaluarsa! Segera tukarkan sebelum hangus.',
  },
]

// ─── Template variable substitution ──────────────────────────────────────────

export interface TemplateVars {
  name?: string
  points?: number | string
  tier?: string
}

export function substituteTemplateVars(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{name\}/g, vars.name ?? '')
    .replace(/\{points\}/g, String(vars.points ?? ''))
    .replace(/\{tier\}/g, vars.tier ?? '')
}

// ─── SMS character count ──────────────────────────────────────────────────────

export const SMS_CHAR_LIMIT = 160

export function validateSmsLength(message: string): {
  valid: boolean
  length: number
  limit: number
} {
  const length = message.length
  return { valid: length <= SMS_CHAR_LIMIT, length, limit: SMS_CHAR_LIMIT }
}

// ─── Audience filter logic ────────────────────────────────────────────────────

export interface CustomerRow {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  segment?: string | null
  loyaltyTierId?: string | null
}

export function filterAudience(
  customers: CustomerRow[],
  audience: AudienceType,
  audienceValue?: string | null,
): CustomerRow[] {
  if (audience === 'ALL') return customers
  if (audience === 'SEGMENT') {
    if (!audienceValue) return customers
    return customers.filter(c => c.segment === audienceValue)
  }
  if (audience === 'LOYALTY_TIER') {
    if (!audienceValue) return customers
    return customers.filter(c => c.loyaltyTierId === audienceValue)
  }
  return customers
}

// ─── Campaign status transitions ──────────────────────────────────────────────

export type StatusTransition = { from: CampaignStatus; to: CampaignStatus }

const VALID_TRANSITIONS: StatusTransition[] = [
  { from: 'DRAFT', to: 'SCHEDULED' },
  { from: 'DRAFT', to: 'SENT' },
  { from: 'SCHEDULED', to: 'SENT' },
  { from: 'SCHEDULED', to: 'DRAFT' }, // cancel scheduling
]

export function isValidCampaignTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return VALID_TRANSITIONS.some(t => t.from === from && t.to === to)
}

// ─── Schedule validation ──────────────────────────────────────────────────────

export function validateScheduledAt(scheduledAt: string | null | undefined): {
  valid: boolean
  error?: string
} {
  if (!scheduledAt) return { valid: true }
  const d = new Date(scheduledAt)
  if (isNaN(d.getTime())) return { valid: false, error: 'Invalid date format' }
  if (d <= new Date()) return { valid: false, error: 'Scheduled time must be in the future' }
  return { valid: true }
}

// ─── Simulated delivery stats ─────────────────────────────────────────────────

export function simulateDeliveryStats(sentCount: number): {
  delivered: number
  failed: number
  opened: number
} {
  const deliveryRate = 0.92 + Math.random() * 0.06
  const openRate = 0.18 + Math.random() * 0.22
  const delivered = Math.round(sentCount * deliveryRate)
  const failed = sentCount - delivered
  const opened = Math.round(delivered * openRate)
  return { delivered, failed, opened }
}
