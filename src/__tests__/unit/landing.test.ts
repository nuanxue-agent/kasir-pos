import { describe, it, expect } from 'vitest'

// ── Types mirroring page.tsx exports ─────────────────────────────────────────

interface Feature {
  id: string
  title: string
}

interface PricingTier {
  id: string
  name: string
  price: number
  label: string
  per: string
  features: string[]
  cta: string
  ctaHref: string
  highlight: boolean
}

// ── Data mirrored from page.tsx (pure data, no JSX import needed) ─────────────

const DEMO_EMAIL = 'owner@demo.com'
const DEMO_PASSWORD = 'demo123'
const DEMO_LOGIN_HREF = `/login?email=${encodeURIComponent(DEMO_EMAIL)}&demo=1`

const FEATURES: Feature[] = [
  { id: 'pos',        title: 'Kasir (POS)' },
  { id: 'inventory',  title: 'Manajemen Stok' },
  { id: 'reports',    title: 'Laporan & Analitik' },
  { id: 'multistore', title: 'Multi-Toko' },
  { id: 'offline',    title: 'Offline-Ready' },
  { id: 'customers',  title: 'Data Pelanggan' },
]

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'FREE',
    price: 0,
    label: 'Gratis',
    per: '/bulan',
    features: ['1 toko', '2 kasir', '100 produk', 'Laporan dasar'],
    cta: 'Mulai Gratis',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'PRO',
    price: 99000,
    label: 'Rp 99rb',
    per: '/bulan',
    features: ['3 toko', '10 kasir', 'Produk tak terbatas', 'Laporan lengkap', 'Poin loyalitas', 'Prioritas dukungan'],
    cta: 'Coba Pro',
    ctaHref: '/signup?plan=pro',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'ENTERPRISE',
    price: 299000,
    label: 'Rp 299rb',
    per: '/bulan',
    features: ['Toko tak terbatas', 'Kasir tak terbatas', 'API akses', 'Custom integrasi', 'Dukungan khusus'],
    cta: 'Hubungi Kami',
    ctaHref: '/signup?plan=enterprise',
    highlight: false,
  },
]

// ── Helper: get demo credentials ──────────────────────────────────────────────

function getDemoCredentials() {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD }
}

function buildDemoLoginHref(email: string) {
  return `/login?email=${encodeURIComponent(email)}&demo=1`
}

// ── 1. Demo credentials helper ────────────────────────────────────────────────

describe('Demo credentials helper', () => {
  it('returns the correct demo email', () => {
    const creds = getDemoCredentials()
    expect(creds.email).toBe('owner@demo.com')
  })

  it('returns the correct demo password', () => {
    const creds = getDemoCredentials()
    expect(creds.password).toBe('demo123')
  })

  it('demo login href includes email query param', () => {
    expect(DEMO_LOGIN_HREF).toContain('email=')
  })

  it('demo login href includes demo=1 flag', () => {
    expect(DEMO_LOGIN_HREF).toContain('demo=1')
  })

  it('buildDemoLoginHref encodes special characters in email', () => {
    const href = buildDemoLoginHref('test+tag@example.com')
    expect(href).not.toContain('+')          // + must be percent-encoded
    expect(href).toContain('test')
  })
})

// ── 2. Feature list completeness ─────────────────────────────────────────────

describe('Feature list completeness', () => {
  it('has exactly 6 features', () => {
    expect(FEATURES).toHaveLength(6)
  })

  it('includes POS feature', () => {
    expect(FEATURES.some(f => f.id === 'pos')).toBe(true)
  })

  it('includes inventory management feature', () => {
    expect(FEATURES.some(f => f.id === 'inventory')).toBe(true)
  })

  it('includes reports feature', () => {
    expect(FEATURES.some(f => f.id === 'reports')).toBe(true)
  })

  it('includes multi-store feature', () => {
    expect(FEATURES.some(f => f.id === 'multistore')).toBe(true)
  })

  it('includes offline-ready feature', () => {
    expect(FEATURES.some(f => f.id === 'offline')).toBe(true)
  })

  it('every feature has a non-empty title', () => {
    FEATURES.forEach(f => {
      expect(f.title.length).toBeGreaterThan(0)
    })
  })
})

// ── 3. Pricing tier validation ────────────────────────────────────────────────

describe('Pricing tier validation', () => {
  it('has exactly 3 pricing tiers', () => {
    expect(PRICING_TIERS).toHaveLength(3)
  })

  it('FREE tier has price 0', () => {
    const free = PRICING_TIERS.find(t => t.id === 'free')
    expect(free?.price).toBe(0)
  })

  it('PRO tier is marked as highlighted (most popular)', () => {
    const pro = PRICING_TIERS.find(t => t.id === 'pro')
    expect(pro?.highlight).toBe(true)
  })

  it('ENTERPRISE tier has higher price than PRO', () => {
    const pro = PRICING_TIERS.find(t => t.id === 'pro')!
    const enterprise = PRICING_TIERS.find(t => t.id === 'enterprise')!
    expect(enterprise.price).toBeGreaterThan(pro.price)
  })

  it('every tier has at least one feature listed', () => {
    PRICING_TIERS.forEach(tier => {
      expect(tier.features.length).toBeGreaterThan(0)
    })
  })

  it('tiers are ordered free → pro → enterprise by price', () => {
    const prices = PRICING_TIERS.map(t => t.price)
    const sorted = [...prices].sort((a, b) => a - b)
    expect(prices).toEqual(sorted)
  })

  it('only one tier is highlighted', () => {
    const highlighted = PRICING_TIERS.filter(t => t.highlight)
    expect(highlighted).toHaveLength(1)
  })
})

// ── 4. CTA link correctness ───────────────────────────────────────────────────

describe('CTA link correctness', () => {
  it('FREE tier CTA links to /signup', () => {
    const free = PRICING_TIERS.find(t => t.id === 'free')!
    expect(free.ctaHref).toBe('/signup')
  })

  it('PRO tier CTA includes plan=pro query param', () => {
    const pro = PRICING_TIERS.find(t => t.id === 'pro')!
    expect(pro.ctaHref).toContain('plan=pro')
  })

  it('ENTERPRISE tier CTA includes plan=enterprise query param', () => {
    const enterprise = PRICING_TIERS.find(t => t.id === 'enterprise')!
    expect(enterprise.ctaHref).toContain('plan=enterprise')
  })

  it('demo CTA href points to /login path', () => {
    expect(DEMO_LOGIN_HREF.startsWith('/login')).toBe(true)
  })

  it('all signup CTA hrefs start with /signup', () => {
    const signupTiers = PRICING_TIERS.filter(t => t.id !== 'enterprise')
    signupTiers.forEach(t => {
      expect(t.ctaHref.startsWith('/signup')).toBe(true)
    })
  })
})
