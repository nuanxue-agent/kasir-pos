import { describe, it, expect, beforeEach } from 'vitest'
import {
  substituteTemplateVars,
  validateSmsLength,
  filterAudience,
  isValidCampaignTransition,
  validateScheduledAt,
  MESSAGE_TEMPLATES,
  SMS_CHAR_LIMIT,
  type CustomerRow,
  type CampaignStatus,
  type AudienceType,
} from '@/lib/marketing'

// ─── 1. Template variable substitution ───────────────────────────────────────

describe('substituteTemplateVars', () => {
  it('replaces {name} with provided value', () => {
    const result = substituteTemplateVars('Halo {name}!', { name: 'Budi' })
    expect(result).toBe('Halo Budi!')
  })

  it('replaces {points} with numeric value', () => {
    const result = substituteTemplateVars('Anda punya {points} poin', { points: 250 })
    expect(result).toBe('Anda punya 250 poin')
  })

  it('replaces {tier} with tier string', () => {
    const result = substituteTemplateVars('Selamat datang {tier}!', { tier: 'Gold' })
    expect(result).toBe('Selamat datang Gold!')
  })

  it('replaces all three variables in one template', () => {
    const result = substituteTemplateVars('{name} tier {tier} punya {points} poin', {
      name: 'Sari',
      tier: 'Silver',
      points: 100,
    })
    expect(result).toBe('Sari tier Silver punya 100 poin')
  })

  it('replaces multiple occurrences of same variable', () => {
    const result = substituteTemplateVars('{name} is {name}', { name: 'Ana' })
    expect(result).toBe('Ana is Ana')
  })

  it('leaves placeholder empty when var not provided', () => {
    const result = substituteTemplateVars('Halo {name}', {})
    expect(result).toBe('Halo ')
  })

  it('built-in promo template substitution works end-to-end', () => {
    const tpl = MESSAGE_TEMPLATES.find(t => t.id === 'promo-akhir-bulan')!
    const result = substituteTemplateVars(tpl.body, { name: 'Joko' })
    expect(result).toContain('Joko')
    expect(result).not.toContain('{name}')
  })
})

// ─── 2. Audience filter logic ─────────────────────────────────────────────────

describe('filterAudience', () => {
  const customers: CustomerRow[] = [
    { id: '1', name: 'A', segment: 'Champions', loyaltyTierId: 'gold' },
    { id: '2', name: 'B', segment: 'Loyal',     loyaltyTierId: 'silver' },
    { id: '3', name: 'C', segment: 'AtRisk',    loyaltyTierId: 'gold' },
    { id: '4', name: 'D', segment: null,         loyaltyTierId: null },
  ]

  it('ALL returns every customer', () => {
    expect(filterAudience(customers, 'ALL')).toHaveLength(4)
  })

  it('SEGMENT filters by matching segment', () => {
    const result = filterAudience(customers, 'SEGMENT', 'Champions')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('LOYALTY_TIER filters by tier id', () => {
    const result = filterAudience(customers, 'LOYALTY_TIER', 'gold')
    expect(result).toHaveLength(2)
  })

  it('SEGMENT with no audienceValue returns all', () => {
    const result = filterAudience(customers, 'SEGMENT', null)
    expect(result).toHaveLength(4)
  })
})

// ─── 3. Campaign status transitions ──────────────────────────────────────────

describe('isValidCampaignTransition', () => {
  it('DRAFT -> SCHEDULED is valid', () => {
    expect(isValidCampaignTransition('DRAFT', 'SCHEDULED')).toBe(true)
  })

  it('DRAFT -> SENT is valid (immediate send)', () => {
    expect(isValidCampaignTransition('DRAFT', 'SENT')).toBe(true)
  })

  it('SCHEDULED -> SENT is valid', () => {
    expect(isValidCampaignTransition('SCHEDULED', 'SENT')).toBe(true)
  })

  it('SENT -> DRAFT is invalid', () => {
    expect(isValidCampaignTransition('SENT', 'DRAFT')).toBe(false)
  })

  it('SENT -> SCHEDULED is invalid', () => {
    expect(isValidCampaignTransition('SENT', 'SCHEDULED')).toBe(false)
  })

  it('SCHEDULED -> DRAFT is valid (cancel scheduling)', () => {
    expect(isValidCampaignTransition('SCHEDULED', 'DRAFT')).toBe(true)
  })
})

// ─── 4. SMS character count ───────────────────────────────────────────────────

describe('validateSmsLength', () => {
  it('short message is valid', () => {
    const result = validateSmsLength('Hello World')
    expect(result.valid).toBe(true)
    expect(result.length).toBe(11)
    expect(result.limit).toBe(SMS_CHAR_LIMIT)
  })

  it('exactly 160 chars is valid', () => {
    const msg = 'a'.repeat(160)
    const result = validateSmsLength(msg)
    expect(result.valid).toBe(true)
    expect(result.length).toBe(160)
  })

  it('161 chars is invalid', () => {
    const msg = 'a'.repeat(161)
    const result = validateSmsLength(msg)
    expect(result.valid).toBe(false)
  })

  it('empty string is valid', () => {
    const result = validateSmsLength('')
    expect(result.valid).toBe(true)
    expect(result.length).toBe(0)
  })
})

// ─── 5. Schedule validation ───────────────────────────────────────────────────

describe('validateScheduledAt', () => {
  it('null scheduledAt (send now) is valid', () => {
    const result = validateScheduledAt(null)
    expect(result.valid).toBe(true)
  })

  it('undefined scheduledAt is valid', () => {
    const result = validateScheduledAt(undefined)
    expect(result.valid).toBe(true)
  })

  it('future date is valid', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const result = validateScheduledAt(future)
    expect(result.valid).toBe(true)
  })

  it('past date is invalid', () => {
    const past = new Date(Date.now() - 3600 * 1000).toISOString()
    const result = validateScheduledAt(past)
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('invalid string is invalid', () => {
    const result = validateScheduledAt('not-a-date')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
