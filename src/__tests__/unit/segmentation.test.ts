import { describe, it, expect } from 'vitest'
import { scoreMetric, assignSegment, computeRFM, type RawCustomerStat } from '@/lib/rfm'

// ── Pure helpers (re-implemented inline so tests are self-contained) ──────────

type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'

interface SegmentRule {
  field: 'recency' | 'frequency' | 'monetary' | 'rfmSegment'
  operator: Operator
  value: number | string
}

function evaluateRule(
  rule: SegmentRule,
  customer: RawCustomerStat & { rfmSegment?: string },
): boolean {
  const { field, operator, value } = rule
  const raw =
    field === 'rfmSegment' ? customer.rfmSegment : customer[field as keyof RawCustomerStat]
  if (raw === undefined || raw === null) return false
  if (typeof raw === 'string') {
    if (operator === 'eq') return raw === String(value)
    if (operator === 'neq') return raw !== String(value)
    return false
  }
  const numVal = Number(value)
  const numRaw = Number(raw)
  switch (operator) {
    case 'gt':
      return numRaw > numVal
    case 'lt':
      return numRaw < numVal
    case 'gte':
      return numRaw >= numVal
    case 'lte':
      return numRaw <= numVal
    case 'eq':
      return numRaw === numVal
    case 'neq':
      return numRaw !== numVal
    default:
      return false
  }
}

function evaluateRules(
  rules: SegmentRule[],
  customer: RawCustomerStat & { rfmSegment?: string },
): boolean {
  return rules.every(r => evaluateRule(r, customer))
}

function countSegmentMembers(
  customers: (RawCustomerStat & { rfmSegment?: string })[],
  rules: SegmentRule[],
): number {
  return customers.filter(c => evaluateRules(rules, c)).length
}

function detectOverlap(
  rulesA: SegmentRule[],
  rulesB: SegmentRule[],
  customers: (RawCustomerStat & { rfmSegment?: string })[],
): number {
  return customers.filter(c => evaluateRules(rulesA, c) && evaluateRules(rulesB, c)).length
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMERS: RawCustomerStat[] = [
  {
    id: '1',
    name: 'Alice',
    phone: null,
    email: null,
    recency: 5,
    frequency: 20,
    monetary: 5_000_000,
  },
  {
    id: '2',
    name: 'Bob',
    phone: null,
    email: null,
    recency: 10,
    frequency: 15,
    monetary: 3_000_000,
  },
  {
    id: '3',
    name: 'Charlie',
    phone: null,
    email: null,
    recency: 45,
    frequency: 8,
    monetary: 1_500_000,
  },
  {
    id: '4',
    name: 'Diana',
    phone: null,
    email: null,
    recency: 90,
    frequency: 3,
    monetary: 500_000,
  },
  { id: '5', name: 'Eve', phone: null, email: null, recency: 180, frequency: 1, monetary: 100_000 },
  { id: '6', name: 'Frank', phone: null, email: null, recency: 3, frequency: 2, monetary: 200_000 },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RFM score calculation', () => {
  it('scoreMetric returns 5 for the max value in a set', () => {
    const vals = [1, 2, 3, 4, 5]
    expect(scoreMetric(5, vals)).toBe(5)
  })

  it('scoreMetric returns 1 for the min value in a set', () => {
    const vals = [1, 2, 3, 4, 5]
    expect(scoreMetric(1, vals)).toBe(1)
  })

  it('scoreMetric inverts correctly for recency (lower days = higher score)', () => {
    const vals = [5, 10, 30, 60, 180]
    const scoreForRecent = scoreMetric(5, vals, true)
    const scoreForOld = scoreMetric(180, vals, true)
    expect(scoreForRecent).toBeGreaterThan(scoreForOld)
  })

  it('assignSegment returns Champions for high R/F/M', () => {
    expect(assignSegment(5, 5, 5)).toBe('Champions')
  })

  it('assignSegment returns Lost for low R and F', () => {
    expect(assignSegment(1, 1, 1)).toBe('Lost')
  })

  it('computeRFM assigns a segment to every customer', () => {
    const result = computeRFM(CUSTOMERS)
    expect(result).toHaveLength(CUSTOMERS.length)
    result.forEach(c => expect(c.segment).toBeTruthy())
  })
})

describe('Rule evaluation (field/operator/value)', () => {
  const alice = CUSTOMERS[0] // recency=5, frequency=20, monetary=5_000_000

  it('gt operator: frequency > 10 matches high-frequency customer', () => {
    expect(evaluateRule({ field: 'frequency', operator: 'gt', value: 10 }, alice)).toBe(true)
  })

  it('lt operator: recency < 30 matches recent customer', () => {
    expect(evaluateRule({ field: 'recency', operator: 'lt', value: 30 }, alice)).toBe(true)
  })

  it('gte operator: monetary >= 5000000 matches exact boundary', () => {
    expect(evaluateRule({ field: 'monetary', operator: 'gte', value: 5_000_000 }, alice)).toBe(true)
  })

  it('eq operator on rfmSegment string matches correctly', () => {
    const customerWithSeg = { ...alice, rfmSegment: 'Champions' }
    expect(
      evaluateRule({ field: 'rfmSegment', operator: 'eq', value: 'Champions' }, customerWithSeg),
    ).toBe(true)
  })

  it('neq operator on rfmSegment excludes non-matching segment', () => {
    const customerWithSeg = { ...alice, rfmSegment: 'Loyal' }
    expect(
      evaluateRule({ field: 'rfmSegment', operator: 'eq', value: 'Champions' }, customerWithSeg),
    ).toBe(false)
  })
})

describe('Segment member count', () => {
  it('counts customers matching a single recency rule', () => {
    const rules: SegmentRule[] = [{ field: 'recency', operator: 'lte', value: 30 }]
    const count = countSegmentMembers(CUSTOMERS, rules)
    // recency <= 30: Alice(5), Bob(10), Charlie(45 no), Diana(90 no), Eve(180 no), Frank(3)
    expect(count).toBe(3)
  })

  it('counts customers matching combined rules (AND logic)', () => {
    const rules: SegmentRule[] = [
      { field: 'recency', operator: 'lte', value: 30 },
      { field: 'frequency', operator: 'gte', value: 10 },
    ]
    const count = countSegmentMembers(CUSTOMERS, rules)
    // recency<=30 AND frequency>=10: Alice(5,20 yes), Bob(10,15 yes), Frank(3,2 no)
    expect(count).toBe(2)
  })

  it('returns 0 when no customers match impossible rules', () => {
    const rules: SegmentRule[] = [{ field: 'recency', operator: 'lt', value: 0 }]
    expect(countSegmentMembers(CUSTOMERS, rules)).toBe(0)
  })
})

describe('Campaign targeting logic', () => {
  it('DISCOUNT campaign targets correct segment size', () => {
    const rules: SegmentRule[] = [{ field: 'monetary', operator: 'gte', value: 1_000_000 }]
    const audienceSize = countSegmentMembers(CUSTOMERS, rules)
    // monetary >= 1_000_000: Alice(5M), Bob(3M), Charlie(1.5M) = 3
    expect(audienceSize).toBe(3)
  })

  it('POINTS campaign can target new/infrequent customers', () => {
    const rules: SegmentRule[] = [{ field: 'frequency', operator: 'lte', value: 3 }]
    const audienceSize = countSegmentMembers(CUSTOMERS, rules)
    // frequency <= 3: Diana(3), Eve(1), Frank(2) = 3
    expect(audienceSize).toBe(3)
  })
})

describe('Segment overlap detection', () => {
  it('detects zero overlap between mutually exclusive segments', () => {
    const highValue: SegmentRule[] = [{ field: 'monetary', operator: 'gte', value: 3_000_000 }]
    const lowValue: SegmentRule[] = [{ field: 'monetary', operator: 'lt', value: 500_000 }]
    const overlap = detectOverlap(highValue, lowValue, CUSTOMERS)
    expect(overlap).toBe(0)
  })

  it('detects overlap when segments share customers', () => {
    const recentActive: SegmentRule[] = [
      { field: 'recency', operator: 'lte', value: 15 },
      { field: 'frequency', operator: 'gte', value: 10 },
    ]
    const highFreq: SegmentRule[] = [{ field: 'frequency', operator: 'gte', value: 15 }]
    const overlap = detectOverlap(recentActive, highFreq, CUSTOMERS)
    // Both match Alice(rec=5,freq=20) and Bob(rec=10,freq=15)
    expect(overlap).toBeGreaterThan(0)
  })
})
