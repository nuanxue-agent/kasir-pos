import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')

function readSrc(rel: string): string {
  return readFileSync(path.join(root, 'src', rel), 'utf-8')
}

function srcExists(rel: string): boolean {
  return existsSync(path.join(root, 'src', rel))
}

// ── 1. PageSkeleton component exists ──────────────────────────────────────────
describe('PageSkeleton', () => {
  it('component file exists', () => {
    expect(srcExists('components/ui/PageSkeleton.tsx')).toBe(true)
  })

  it('exports PageSkeleton function', () => {
    const src = readSrc('components/ui/PageSkeleton.tsx')
    expect(src).toContain('export function PageSkeleton')
  })

  it('has animate-pulse class', () => {
    const src = readSrc('components/ui/PageSkeleton.tsx')
    expect(src).toContain('animate-pulse')
  })

  it('renders skeleton grid with 3 items', () => {
    const src = readSrc('components/ui/PageSkeleton.tsx')
    // Should map over [1,2,3]
    expect(src).toMatch(/\[1\s*,\s*2\s*,\s*3\]/)
  })
})

// ── 2. Suspense boundaries on heavy pages ─────────────────────────────────────
describe('Suspense boundaries', () => {
  it('POS page wraps client component in Suspense', () => {
    const src = readSrc('app/(dashboard)/dashboard/pos/page.tsx')
    expect(src).toContain('Suspense')
    expect(src).toContain('PageSkeleton')
  })

  it('HR page wraps client component in Suspense', () => {
    const src = readSrc('app/(dashboard)/dashboard/hr/page.tsx')
    expect(src).toContain('Suspense')
    expect(src).toContain('PageSkeleton')
  })

  it('CRM page wraps client component in Suspense', () => {
    const src = readSrc('app/(dashboard)/dashboard/crm/page.tsx')
    expect(src).toContain('Suspense')
    expect(src).toContain('PageSkeleton')
  })

  it('Analytics page wraps client component in Suspense', () => {
    const src = readSrc('app/(dashboard)/dashboard/reports/analytics/page.tsx')
    expect(src).toContain('Suspense')
    expect(src).toContain('PageSkeleton')
  })
})

// ── 3. Dynamic imports for recharts ───────────────────────────────────────────
describe('dynamic recharts imports', () => {
  it('SalesAnalyticsClient uses dynamic() for recharts', () => {
    const src = readSrc('components/reports/SalesAnalyticsClient.tsx')
    expect(src).toContain("import dynamic from 'next/dynamic'")
    expect(src).toContain("ssr: false")
    // Should NOT have the old top-level recharts import
    expect(src).not.toMatch(/^import\s*\{[^}]*BarChart[^}]*\}\s*from\s*['"]recharts['"]/m)
  })

  it('SalesChart uses dynamic() for recharts', () => {
    const src = readSrc('components/reports/SalesChart.tsx')
    expect(src).toContain("import dynamic from 'next/dynamic'")
    expect(src).toContain("ssr: false")
  })

  it('TopProductsChart uses dynamic() for recharts', () => {
    const src = readSrc('components/reports/TopProductsChart.tsx')
    expect(src).toContain("import dynamic from 'next/dynamic'")
    expect(src).toContain("ssr: false")
  })
})

// ── 4. loading.tsx files exist ────────────────────────────────────────────────
describe('route loading states', () => {
  it('reports loading.tsx exists and re-exports PageSkeleton', () => {
    expect(srcExists('app/(dashboard)/dashboard/reports/loading.tsx')).toBe(true)
    const src = readSrc('app/(dashboard)/dashboard/reports/loading.tsx')
    expect(src).toContain('PageSkeleton')
  })

  it('hr loading.tsx exists and re-exports PageSkeleton', () => {
    expect(srcExists('app/(dashboard)/dashboard/hr/loading.tsx')).toBe(true)
    const src = readSrc('app/(dashboard)/dashboard/hr/loading.tsx')
    expect(src).toContain('PageSkeleton')
  })

  it('crm loading.tsx exists and re-exports PageSkeleton', () => {
    expect(srcExists('app/(dashboard)/dashboard/crm/loading.tsx')).toBe(true)
    const src = readSrc('app/(dashboard)/dashboard/crm/loading.tsx')
    expect(src).toContain('PageSkeleton')
  })
})
