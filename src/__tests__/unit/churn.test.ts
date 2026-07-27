import { describe, it, expect } from 'vitest'
import {
  calcChurnScore,
  scoreToRiskLevel,
  calcFrequencyTrend,
  calcValueTrendNegative,
  buildReEngagementMessage,
  recommendedAction,
} from '@/components/reports/ChurnPredictionClient'

// ── Churn score calculation ───────────────────────────────────────────────────

describe('calcChurnScore', () => {
  it('returns 0 for a perfectly active customer (recency=0, trend=1, value=0)', () => {
    expect(calcChurnScore(0, 1, 0)).toBe(0)
  })

  it('returns 100 for worst-case customer (recency≥90, freq=0, value=1)', () => {
    expect(calcChurnScore(90, 0, 1)).toBe(100)
  })

  it('caps at 100 even for extreme inputs', () => {
    expect(calcChurnScore(200, 0, 2)).toBe(100)
  })

  it('recency component is 40 at 90 days with no freq/value penalty', () => {
    // recency=90 → 40, freq_trend=1 → 0, value_neg=0 → 0 = 40
    expect(calcChurnScore(90, 1, 0)).toBe(40)
  })

  it('frequency component is 30 when frequency_trend=0 and no recency/value penalty', () => {
    // recency=0 → 0, freq_trend=0 → 30, value_neg=0 → 0 = 30
    expect(calcChurnScore(0, 0, 0)).toBe(30)
  })

  it('value component is 30 when value_trend_negative=1 and no recency/freq penalty', () => {
    // recency=0 → 0, freq_trend=1 → 0, value_neg=1 → 30 = 30
    expect(calcChurnScore(0, 1, 1)).toBe(30)
  })
})

// ── Risk level thresholds ─────────────────────────────────────────────────────

describe('scoreToRiskLevel', () => {
  it('score < 40 is LOW', () => {
    expect(scoreToRiskLevel(0)).toBe('LOW')
    expect(scoreToRiskLevel(39)).toBe('LOW')
  })

  it('score 40–69 is MEDIUM', () => {
    expect(scoreToRiskLevel(40)).toBe('MEDIUM')
    expect(scoreToRiskLevel(69)).toBe('MEDIUM')
  })

  it('score ≥ 70 is HIGH', () => {
    expect(scoreToRiskLevel(70)).toBe('HIGH')
    expect(scoreToRiskLevel(100)).toBe('HIGH')
  })
})

// ── Frequency trend detection ─────────────────────────────────────────────────

describe('calcFrequencyTrend', () => {
  it('returns 1 when recent and older rates are equal', () => {
    // 30 orders in 30 days vs 60 orders in 60 days — same rate
    expect(calcFrequencyTrend(30, 60, 30, 60)).toBeCloseTo(1)
  })

  it('returns > 1 (capped at 1) when recent rate is higher', () => {
    // 10 orders in 15 days (0.67/d) vs 5 orders in 30 days (0.17/d)
    const trend = calcFrequencyTrend(10, 5, 15, 30)
    expect(trend).toBeLessThanOrEqual(1)
    expect(trend).toBeGreaterThan(0.5)
  })

  it('returns < 1 when recent rate is lower (declining)', () => {
    // 1 order in 30 days vs 30 orders in 60 days
    const trend = calcFrequencyTrend(1, 30, 30, 60)
    expect(trend).toBeLessThan(1)
  })

  it('returns 0.5 when both counts are 0 and older is 0', () => {
    expect(calcFrequencyTrend(0, 0, 30, 60)).toBe(0.5)
  })
})

// ── Value trend calculation ───────────────────────────────────────────────────

describe('calcValueTrendNegative', () => {
  it('returns 0 when olderAvgValue is 0 (no baseline)', () => {
    expect(calcValueTrendNegative(1000, 0)).toBe(0)
  })

  it('returns 0 when recent equals older (no drop)', () => {
    expect(calcValueTrendNegative(50000, 50000)).toBe(0)
  })

  it('returns ~0.5 when recent is half of older', () => {
    expect(calcValueTrendNegative(25000, 50000)).toBeCloseTo(0.5)
  })

  it('caps at 1 when recent drops to 0', () => {
    expect(calcValueTrendNegative(0, 50000)).toBe(1)
  })

  it('clamps negative drops (recent > older) to 0', () => {
    expect(calcValueTrendNegative(80000, 50000)).toBe(0)
  })
})

// ── Re-engagement message generation ─────────────────────────────────────────

describe('buildReEngagementMessage', () => {
  it('includes the customer name', () => {
    const msg = buildReEngagementMessage('Budi')
    expect(msg).toContain('Budi')
  })

  it('starts with Halo', () => {
    const msg = buildReEngagementMessage('Sari')
    expect(msg.startsWith('Halo Sari')).toBe(true)
  })

  it('contains the promo phrase', () => {
    const msg = buildReEngagementMessage('Ahmad')
    expect(msg).toContain('promo spesial')
  })

  it('mentions kangen', () => {
    const msg = buildReEngagementMessage('Dewi')
    expect(msg).toContain('kangen')
  })
})

// ── Recommended action ────────────────────────────────────────────────────────

describe('recommendedAction', () => {
  it('returns WhatsApp action for HIGH risk with recent days < 60', () => {
    const action = recommendedAction('HIGH', 30)
    expect(action.toLowerCase()).toContain('whatsapp')
  })

  it('returns urgent action for HIGH risk with days > 60', () => {
    const action = recommendedAction('HIGH', 90)
    expect(action).toBeTruthy()
    expect(action.length).toBeGreaterThan(0)
  })

  it('returns discount/loyalty suggestion for MEDIUM risk', () => {
    const action = recommendedAction('MEDIUM', 20)
    expect(action.toLowerCase()).toMatch(/diskon|loyalitas|loyalty/)
  })

  it('returns retention suggestion for LOW risk', () => {
    const action = recommendedAction('LOW', 5)
    expect(action.toLowerCase()).toMatch(/loyalitas|loyalty|pertahankan/)
  })
})
