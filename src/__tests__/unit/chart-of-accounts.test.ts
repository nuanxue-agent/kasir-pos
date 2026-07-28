import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

interface Account {
  id: string
  storeId: string
  code: string
  name: string
  type: AccountType
  subtype: string | null
  parentId: string | null
  level: number
  active: number
  description: string | null
  isSystem: number
  balance: number
  createdAt: string
  updatedAt: string
  children?: Account[]
}

// ── Pure helpers (mirrors ChartOfAccountsClient exports) ──────────────────────

function validateCoaCode(code: string): string | null {
  if (!code) return 'Kode akun harus diisi'
  if (!/^\d{4,6}$/.test(code.trim())) return 'Kode akun harus 4-6 digit angka'
  return null
}

function inferTypeFromCode(code: string): AccountType | null {
  if (!/^\d+$/.test(code)) return null
  const first = code[0]
  if (first === '1') return 'ASSET'
  if (first === '2') return 'LIABILITY'
  if (first === '3') return 'EQUITY'
  if (first === '4') return 'REVENUE'
  if (first === '5') return 'EXPENSE'
  return null
}

function getDebitCreditNormal(type: AccountType): 'debit' | 'credit' {
  return (type === 'ASSET' || type === 'EXPENSE') ? 'debit' : 'credit'
}

function buildAccountTree(accounts: Account[]): Account[] {
  const map = new Map<string, Account>()
  for (const a of accounts) map.set(a.id, { ...a, children: [] })
  const roots: Account[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }
  const sort = (nodes: Account[]): Account[] => {
    nodes.sort((a, b) => a.code.localeCompare(b.code))
    for (const n of nodes) n.children = sort(n.children ?? [])
    return nodes
  }
  return sort(roots)
}

function classifyAccountType(code: string): AccountType | null {
  return inferTypeFromCode(code)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    storeId: 'store-1',
    code: '1100',
    name: 'Kas',
    type: 'ASSET',
    subtype: 'CURRENT_ASSET',
    parentId: null,
    level: 0,
    active: 1,
    description: null,
    isSystem: 0,
    balance: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Account code validation', () => {
  it('accepts valid 4-digit code', () => {
    expect(validateCoaCode('1100')).toBeNull()
  })

  it('accepts valid 6-digit code', () => {
    expect(validateCoaCode('110100')).toBeNull()
  })

  it('rejects empty code', () => {
    expect(validateCoaCode('')).not.toBeNull()
  })

  it('rejects non-numeric code', () => {
    expect(validateCoaCode('ABCD')).not.toBeNull()
  })

  it('rejects 3-digit code', () => {
    expect(validateCoaCode('110')).not.toBeNull()
  })
})

describe('Account type classification', () => {
  it('classifies 1xxx as ASSET', () => {
    expect(classifyAccountType('1100')).toBe('ASSET')
  })

  it('classifies 2xxx as LIABILITY', () => {
    expect(classifyAccountType('2100')).toBe('LIABILITY')
  })

  it('classifies 3xxx as EQUITY', () => {
    expect(classifyAccountType('3000')).toBe('EQUITY')
  })

  it('classifies 4xxx as REVENUE', () => {
    expect(classifyAccountType('4100')).toBe('REVENUE')
  })

  it('classifies 5xxx as EXPENSE', () => {
    expect(classifyAccountType('5200')).toBe('EXPENSE')
  })

  it('returns null for unknown first digit', () => {
    expect(classifyAccountType('9999')).toBeNull()
  })
})

describe('Tree hierarchy building', () => {
  it('builds a two-level tree from flat accounts', () => {
    const parent = makeAccount({ id: 'p1', code: '1000', name: 'Aset', parentId: null })
    const child = makeAccount({ id: 'c1', code: '1100', name: 'Aset Lancar', parentId: 'p1' })
    const tree = buildAccountTree([parent, child])
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children![0].id).toBe('c1')
  })

  it('puts orphan accounts at root level', () => {
    const orphan = makeAccount({ id: 'o1', code: '1100', parentId: 'nonexistent' })
    const tree = buildAccountTree([orphan])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('o1')
  })

  it('sorts siblings by code', () => {
    const a = makeAccount({ id: 'a', code: '5200', name: 'B', parentId: null })
    const b = makeAccount({ id: 'b', code: '1000', name: 'A', parentId: null })
    const tree = buildAccountTree([a, b])
    expect(tree[0].code).toBe('1000')
    expect(tree[1].code).toBe('5200')
  })
})

describe('Parent-child relationship', () => {
  it('child correctly references parent id', () => {
    const parent = makeAccount({ id: 'parent-1', code: '2000', type: 'LIABILITY', parentId: null })
    const child = makeAccount({ id: 'child-1', code: '2100', type: 'LIABILITY', parentId: 'parent-1' })
    const tree = buildAccountTree([parent, child])
    expect(tree[0].children![0].parentId).toBe('parent-1')
  })

  it('deeply nested three-level tree is built correctly', () => {
    const grandparent = makeAccount({ id: 'gp', code: '1000', parentId: null, level: 0 })
    const parent = makeAccount({ id: 'p', code: '1100', parentId: 'gp', level: 1 })
    const child = makeAccount({ id: 'c', code: '1110', parentId: 'p', level: 2 })
    const tree = buildAccountTree([grandparent, parent, child])
    expect(tree[0].children![0].children![0].id).toBe('c')
  })
})

describe('Debit/credit normal balance', () => {
  it('ASSET has debit normal balance', () => {
    expect(getDebitCreditNormal('ASSET')).toBe('debit')
  })

  it('LIABILITY has credit normal balance', () => {
    expect(getDebitCreditNormal('LIABILITY')).toBe('credit')
  })

  it('EQUITY has credit normal balance', () => {
    expect(getDebitCreditNormal('EQUITY')).toBe('credit')
  })

  it('REVENUE has credit normal balance', () => {
    expect(getDebitCreditNormal('REVENUE')).toBe('credit')
  })

  it('EXPENSE has debit normal balance', () => {
    expect(getDebitCreditNormal('EXPENSE')).toBe('debit')
  })
})
