import { describe, it, expect } from 'vitest'

// ── Pure functions (mirrors ChartOfAccountsClient exports) ───────────────────

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

/** CoA code must be exactly 4 numeric digits */
function validateCoaCode(code: string): string | null {
  if (!code) return 'Kode akun harus diisi'
  if (!/^\d{4}$/.test(code)) return 'Kode akun harus 4 digit angka'
  return null
}

/** Infer account type from leading digit (1xxx=ASSET, etc.) */
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

/** Opening balance must be >= 0 */
function validateOpeningBalance(value: number): string | null {
  if (isNaN(value)) return 'Saldo awal harus berupa angka'
  if (value < 0) return 'Saldo awal harus >= 0'
  return null
}

/** Account can only be deleted when balance is exactly 0 */
function canDeleteAccount(account: { balance: number }): boolean {
  return account.balance === 0
}

// ── CoA code format validation ────────────────────────────────────────────────

describe('CoA code format validation', () => {
  it('accepts a valid 4-digit numeric code', () => {
    expect(validateCoaCode('1100')).toBeNull()
  })

  it('rejects an empty code', () => {
    expect(validateCoaCode('')).toBe('Kode akun harus diisi')
  })

  it('rejects a 3-digit code (too short)', () => {
    expect(validateCoaCode('110')).toBe('Kode akun harus 4 digit angka')
  })

  it('rejects a 5-digit code (too long)', () => {
    expect(validateCoaCode('11000')).toBe('Kode akun harus 4 digit angka')
  })

  it('rejects a code with alpha characters', () => {
    expect(validateCoaCode('1A00')).toBe('Kode akun harus 4 digit angka')
  })

  it('rejects a code with spaces', () => {
    expect(validateCoaCode('11 0')).toBe('Kode akun harus 4 digit angka')
  })
})

// ── Type classification from code ────────────────────────────────────────────

describe('Account type classification from code', () => {
  it('1xxx maps to ASSET', () => {
    expect(inferTypeFromCode('1100')).toBe('ASSET')
  })

  it('2xxx maps to LIABILITY', () => {
    expect(inferTypeFromCode('2100')).toBe('LIABILITY')
  })

  it('3xxx maps to EQUITY', () => {
    expect(inferTypeFromCode('3100')).toBe('EQUITY')
  })

  it('4xxx maps to REVENUE', () => {
    expect(inferTypeFromCode('4100')).toBe('REVENUE')
  })

  it('5xxx maps to EXPENSE', () => {
    expect(inferTypeFromCode('5100')).toBe('EXPENSE')
  })

  it('6xxx returns null (unrecognised range)', () => {
    expect(inferTypeFromCode('6100')).toBeNull()
  })

  it('non-numeric code returns null', () => {
    expect(inferTypeFromCode('ABCD')).toBeNull()
  })
})

// ── Opening balance validation ────────────────────────────────────────────────

describe('Opening balance validation', () => {
  it('accepts zero as opening balance', () => {
    expect(validateOpeningBalance(0)).toBeNull()
  })

  it('accepts a positive opening balance', () => {
    expect(validateOpeningBalance(1_000_000)).toBeNull()
  })

  it('rejects a negative opening balance', () => {
    expect(validateOpeningBalance(-1)).toBe('Saldo awal harus >= 0')
  })

  it('rejects NaN', () => {
    expect(validateOpeningBalance(NaN)).toBe('Saldo awal harus berupa angka')
  })
})

// ── Delete guard: cannot delete account with non-zero balance ─────────────────

describe('Account delete guard', () => {
  it('allows deleting an account with zero balance', () => {
    expect(canDeleteAccount({ balance: 0 })).toBe(true)
  })

  it('blocks deleting an account with positive balance', () => {
    expect(canDeleteAccount({ balance: 500_000 })).toBe(false)
  })

  it('blocks deleting an account with negative balance', () => {
    expect(canDeleteAccount({ balance: -100 })).toBe(false)
  })
})
