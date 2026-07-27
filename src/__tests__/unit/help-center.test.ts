import { describe, it, expect, beforeEach } from 'vitest'

// ─── Import pure helpers from source (no DOM/React needed) ────────────────────

import {
  isTourCompleted,
  getCurrentTourStep,
  getNextTourStep,
  TOUR_STEPS,
  readCompletionFromStorage,
  countCompleted,
} from '@/components/onboarding/OnboardingChecklist'

// ─── FAQ search filtering (pure logic mirrored from HelpCenterClient) ──────────

type Category = 'POS' | 'Inventory' | 'Reports' | 'HR' | 'Settings'

interface FaqItem {
  id: string
  category: Category
  question: string
  answer: string
}

const SAMPLE_FAQ: FaqItem[] = [
  {
    id: 'pos-1',
    category: 'POS',
    question: 'Bagaimana cara memulai sesi kasir?',
    answer: 'Buka menu POS dan klik Mulai Shift.',
  },
  {
    id: 'pos-2',
    category: 'POS',
    question: 'Cara menambah diskon ke transaksi?',
    answer: 'Klik ikon % di samping total.',
  },
  {
    id: 'inv-1',
    category: 'Inventory',
    question: 'Cara menambah produk baru?',
    answer: 'Masuk ke menu Produk dan klik Tambah Produk.',
  },
  {
    id: 'rep-1',
    category: 'Reports',
    question: 'Laporan apa saja yang tersedia?',
    answer: 'Penjualan, produk terlaris, pajak, arus kas.',
  },
  {
    id: 'set-1',
    category: 'Settings',
    question: 'Bagaimana cara mengubah tarif pajak?',
    answer: 'Buka Pengaturan tab Toko dan isi kolom Tarif Pajak.',
  },
]

function filterFaq(items: FaqItem[], query: string, category: Category | 'All'): FaqItem[] {
  const q = query.toLowerCase().trim()
  return items.filter(item => {
    const matchCat = category === 'All' || item.category === category
    if (!matchCat) return false
    if (!q) return true
    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
  })
}

// ─── Keyboard shortcut registry (pure logic) ──────────────────────────────────

interface Shortcut {
  key: string
  description: string
  context: string
}

const SHORTCUTS: Shortcut[] = [
  { key: 'Ctrl + K', description: 'Quick Actions', context: 'Global' },
  { key: 'F2', description: 'Fokus pencarian produk', context: 'POS' },
  { key: 'F4', description: 'Proses pembayaran', context: 'POS' },
  { key: 'G + D', description: 'Pergi ke Dashboard', context: 'Navigasi' },
]

function getShortcutsByContext(shortcuts: Shortcut[], context: string): Shortcut[] {
  return shortcuts.filter(s => s.context === context)
}

function findShortcutByKey(shortcuts: Shortcut[], key: string): Shortcut | undefined {
  return shortcuts.find(s => s.key === key)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('FAQ search filtering', () => {
  it('returns all items when query is empty and category is All', () => {
    const result = filterFaq(SAMPLE_FAQ, '', 'All')
    expect(result).toHaveLength(SAMPLE_FAQ.length)
  })

  it('filters by question text (case-insensitive)', () => {
    const result = filterFaq(SAMPLE_FAQ, 'DISKON', 'All')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pos-2')
  })

  it('filters by answer text', () => {
    const result = filterFaq(SAMPLE_FAQ, 'Mulai Shift', 'All')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pos-1')
  })

  it('filters by category', () => {
    const result = filterFaq(SAMPLE_FAQ, '', 'POS')
    expect(result).toHaveLength(2)
    expect(result.every(r => r.category === 'POS')).toBe(true)
  })

  it('returns empty array when no match', () => {
    const result = filterFaq(SAMPLE_FAQ, 'xyznotfound', 'All')
    expect(result).toHaveLength(0)
  })
})

describe('Keyboard shortcut registration', () => {
  it('finds shortcut by exact key', () => {
    const s = findShortcutByKey(SHORTCUTS, 'F2')
    expect(s).toBeDefined()
    expect(s?.description).toBe('Fokus pencarian produk')
  })

  it('returns undefined for unknown key', () => {
    const s = findShortcutByKey(SHORTCUTS, 'F99')
    expect(s).toBeUndefined()
  })

  it('groups shortcuts by context correctly', () => {
    const posShortcuts = getShortcutsByContext(SHORTCUTS, 'POS')
    expect(posShortcuts).toHaveLength(2)
    expect(posShortcuts.every(s => s.context === 'POS')).toBe(true)
  })
})

describe('Tour step progression', () => {
  it('tour has exactly 5 steps', () => {
    expect(TOUR_STEPS).toHaveLength(5)
  })

  it('tour step IDs match expected sequence', () => {
    const ids = TOUR_STEPS.map(s => s.id)
    expect(ids).toEqual(['dashboard', 'pos', 'add-product', 'create-customer', 'view-reports'])
  })

  it('isTourCompleted returns false when key absent', () => {
    expect(isTourCompleted({})).toBe(false)
  })

  it('isTourCompleted returns true when key is "true"', () => {
    expect(isTourCompleted({ product_tour_completed: 'true' })).toBe(true)
  })

  it('getCurrentTourStep defaults to 0', () => {
    expect(getCurrentTourStep({})).toBe(0)
  })

  it('getCurrentTourStep reads saved step', () => {
    expect(getCurrentTourStep({ product_tour_step: '2' })).toBe(2)
  })

  it('getCurrentTourStep clamps to max valid step', () => {
    expect(getCurrentTourStep({ product_tour_step: '999' })).toBe(TOUR_STEPS.length - 1)
  })

  it('getNextTourStep increments correctly', () => {
    expect(getNextTourStep(0)).toBe(1)
    expect(getNextTourStep(3)).toBe(4)
  })

  it('getNextTourStep does not exceed last step index', () => {
    expect(getNextTourStep(TOUR_STEPS.length - 1)).toBe(TOUR_STEPS.length - 1)
  })
})

describe('Help article rendering', () => {
  it('FAQ items each have non-empty question and answer', () => {
    for (const item of SAMPLE_FAQ) {
      expect(item.question.length).toBeGreaterThan(0)
      expect(item.answer.length).toBeGreaterThan(0)
    }
  })
})
