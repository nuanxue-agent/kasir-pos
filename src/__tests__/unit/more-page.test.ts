import { describe, it, expect } from 'vitest'
import { MORE_NAV_ITEMS } from '@/components/dashboard/MorePageClient'

describe('More page nav items', () => {
  it('all nav items have valid hrefs', () => {
    for (const item of MORE_NAV_ITEMS) {
      expect(item.href).toMatch(/^\/dashboard\//)
    }
  })

  it('nav item hrefs are unique', () => {
    const hrefs = MORE_NAV_ITEMS.map(i => i.href)
    const unique = new Set(hrefs)
    expect(unique.size).toBe(hrefs.length)
  })

  it('all labels are non-empty strings', () => {
    for (const item of MORE_NAV_ITEMS) {
      expect(typeof item.label).toBe('string')
      expect(item.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('all icons are valid components (functions)', () => {
    for (const item of MORE_NAV_ITEMS) {
      // Lucide icons are forwardRef objects or functions — either is a valid React component
      expect(['function', 'object'].includes(typeof item.icon)).toBe(true)
      expect(item.icon).not.toBeNull()
    }
  })

  it('grid has at least 8 items', () => {
    expect(MORE_NAV_ITEMS.length).toBeGreaterThanOrEqual(8)
  })
})
