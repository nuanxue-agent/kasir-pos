import { describe, it, expect } from 'vitest'

// ─── Onboarding wizard logic ──────────────────────────────────────────────────

const STEPS = ['store_setup', 'modules', 'seed_data', 'done'] as const
type StepId = (typeof STEPS)[number]

const MODULES = ['pos', 'inventory', 'accounting', 'hr', 'crm', 'loyalty'] as const
type ModuleId = (typeof MODULES)[number]

interface StoreSetup {
  name: string
  address: string
  phone: string
  currency: string
  timezone: string
  storeType: string
}

function validateStoreSetup(setup: StoreSetup): string[] {
  const errors: string[] = []
  if (!setup.name.trim()) errors.push('Store name is required')
  return errors
}

function validateModules(selected: Set<ModuleId>): string[] {
  const errors: string[] = []
  if (selected.size === 0) errors.push('Select at least one module')
  return errors
}

function toggleModule(current: Set<ModuleId>, id: ModuleId): Set<ModuleId> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function getNextStep(current: StepId): StepId | null {
  const idx = STEPS.indexOf(current)
  if (idx < 0 || idx >= STEPS.length - 1) return null
  return STEPS[idx + 1]
}

function buildSeedPayload(
  storeId: string,
  storeType: string,
  seedProducts: boolean,
  modules: Set<ModuleId>,
) {
  return {
    storeId,
    storeType,
    products: seedProducts,
    accounts: modules.has('accounting'),
    customers: modules.has('crm'),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingWizard', () => {
  it('has exactly 4 steps', () => {
    expect(STEPS.length).toBe(4)
    expect(STEPS[0]).toBe('store_setup')
    expect(STEPS[1]).toBe('modules')
    expect(STEPS[2]).toBe('seed_data')
    expect(STEPS[3]).toBe('done')
  })

  it('step 1 requires store name', () => {
    const errors = validateStoreSetup({
      name: '',
      address: '',
      phone: '',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      storeType: '',
    })
    expect(errors).toContain('Store name is required')
  })

  it('step 1 passes with valid store name', () => {
    const errors = validateStoreSetup({
      name: 'Warung Saya',
      address: '',
      phone: '',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      storeType: '',
    })
    expect(errors).toHaveLength(0)
  })

  it('step 2 requires at least one module', () => {
    const errors = validateModules(new Set())
    expect(errors).toContain('Select at least one module')
  })

  it('step 2 passes with one or more modules selected', () => {
    const errors = validateModules(new Set<ModuleId>(['pos']))
    expect(errors).toHaveLength(0)
  })

  it('toggleModule adds and removes correctly', () => {
    const initial = new Set<ModuleId>(['pos', 'inventory'])
    const after = toggleModule(initial, 'inventory')
    expect(after.has('inventory')).toBe(false)
    expect(after.has('pos')).toBe(true)

    const after2 = toggleModule(after, 'crm')
    expect(after2.has('crm')).toBe(true)
    expect(after2.size).toBe(2)
  })

  it('step navigation advances in order', () => {
    expect(getNextStep('store_setup')).toBe('modules')
    expect(getNextStep('modules')).toBe('seed_data')
    expect(getNextStep('seed_data')).toBe('done')
    expect(getNextStep('done')).toBeNull()
  })

  it('seed payload includes products flag and derives accounts/customers from modules', () => {
    const modules = new Set<ModuleId>(['pos', 'accounting', 'crm'])
    const payload = buildSeedPayload('store_demo', 'Food & Beverage', true, modules)
    expect(payload.products).toBe(true)
    expect(payload.accounts).toBe(true)
    expect(payload.customers).toBe(true)
    expect(payload.storeId).toBe('store_demo')
  })

  it('seed payload excludes accounts/customers when modules not selected', () => {
    const modules = new Set<ModuleId>(['pos', 'inventory'])
    const payload = buildSeedPayload('store_demo', 'Retail', false, modules)
    expect(payload.products).toBe(false)
    expect(payload.accounts).toBe(false)
    expect(payload.customers).toBe(false)
  })
})
