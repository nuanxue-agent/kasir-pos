import { describe, it, expect } from 'vitest'

// ── Pure functions mirrored from ProductComparisonClient ──────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock?: number
  sku?: string | null
}

interface ProductSpec {
  id: string
  productId: string
  specName: string
  specValue: string
  specGroup: string
  displayOrder: number
}

interface ComparisonMatrix {
  products: Product[]
  matrix: Record<string, Record<string, Record<string, string>>>
  specKeyOrder: { group: string; name: string }[]
}

function buildComparisonMatrix(
  products: Product[],
  specs: ProductSpec[],
): ComparisonMatrix {
  const sorted = [...specs].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.specName.localeCompare(b.specName),
  )
  const specKeyOrder: { group: string; name: string }[] = []
  const seen = new Set<string>()
  for (const s of sorted) {
    const key = `${s.specGroup}||${s.specName}`
    if (!seen.has(key)) {
      seen.add(key)
      specKeyOrder.push({ group: s.specGroup, name: s.specName })
    }
  }

  const lookup: Record<string, Record<string, string>> = {}
  for (const s of specs) {
    if (!lookup[s.productId]) lookup[s.productId] = {}
    lookup[s.productId][`${s.specGroup}||${s.specName}`] = s.specValue
  }

  const matrix: Record<string, Record<string, Record<string, string>>> = {}
  for (const { group, name } of specKeyOrder) {
    if (!matrix[group]) matrix[group] = {}
    matrix[group][name] = {}
    for (const p of products) {
      matrix[group][name][p.id] = lookup[p.id]?.[`${group}||${name}`] ?? 'N/A'
    }
  }

  return { products, matrix, specKeyOrder }
}

function groupSpecsByCategory(
  specs: ProductSpec[],
): Record<string, ProductSpec[]> {
  const groups: Record<string, ProductSpec[]> = {}
  for (const s of specs) {
    if (!groups[s.specGroup]) groups[s.specGroup] = []
    groups[s.specGroup].push(s)
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.specName.localeCompare(b.specName),
    )
  }
  return groups
}

function exportComparisonToCSV(
  products: Product[],
  matrix: ComparisonMatrix['matrix'],
  specKeyOrder: ComparisonMatrix['specKeyOrder'],
): string {
  const header = ['Spec Group', 'Spec Name', ...products.map(p => p.name)].join(',')
  const priceRow = ['General', 'Price', ...products.map(p => String(p.price))]
    .map(v => `"${v}"`)
    .join(',')
  const rows: string[] = [header, priceRow]
  for (const { group, name } of specKeyOrder) {
    const vals = products.map(p => matrix[group]?.[name]?.[p.id] ?? 'N/A')
    rows.push([`"${group}"`, `"${name}"`, ...vals.map(v => `"${v}"`)].join(','))
  }
  return rows.join('\n')
}

function validateExportFormat(format: string): boolean {
  return format === 'csv' || format === 'pdf'
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const productA: Product = { id: 'p1', name: 'Product A', price: 100000, stock: 10, sku: 'SKU-A' }
const productB: Product = { id: 'p2', name: 'Product B', price: 200000, stock: 5, sku: 'SKU-B' }
const productC: Product = { id: 'p3', name: 'Product C', price: 150000, stock: 0, sku: 'SKU-C' }

const specsA: ProductSpec[] = [
  { id: 's1', productId: 'p1', specName: 'Color', specValue: 'Red', specGroup: 'General', displayOrder: 1 },
  { id: 's2', productId: 'p1', specName: 'Weight', specValue: '1.2kg', specGroup: 'Dimensions', displayOrder: 2 },
  { id: 's3', productId: 'p1', specName: 'CPU', specValue: 'Intel i5', specGroup: 'Technical', displayOrder: 1 },
]
const specsB: ProductSpec[] = [
  { id: 's4', productId: 'p2', specName: 'Color', specValue: 'Blue', specGroup: 'General', displayOrder: 1 },
  { id: 's5', productId: 'p2', specName: 'CPU', specValue: 'Intel i7', specGroup: 'Technical', displayOrder: 1 },
  // Note: no Weight spec for product B → should show N/A
]
const allSpecs = [...specsA, ...specsB]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Spec grouping', () => {
  it('groups specs by specGroup correctly', () => {
    const grouped = groupSpecsByCategory(specsA)
    expect(Object.keys(grouped)).toEqual(
      expect.arrayContaining(['General', 'Dimensions', 'Technical']),
    )
    expect(grouped['General']).toHaveLength(1)
    expect(grouped['Technical']).toHaveLength(1)
    expect(grouped['Dimensions']).toHaveLength(1)
  })

  it('sorts specs within a group by displayOrder then specName', () => {
    const specs: ProductSpec[] = [
      { id: 'x1', productId: 'p1', specName: 'Zebra', specValue: 'Z', specGroup: 'General', displayOrder: 2 },
      { id: 'x2', productId: 'p1', specName: 'Alpha', specValue: 'A', specGroup: 'General', displayOrder: 1 },
      { id: 'x3', productId: 'p1', specName: 'Beta', specValue: 'B', specGroup: 'General', displayOrder: 1 },
    ]
    const grouped = groupSpecsByCategory(specs)
    const names = grouped['General'].map(s => s.specName)
    // displayOrder 1 comes first; among order=1, Alpha < Beta alphabetically
    expect(names[0]).toBe('Alpha')
    expect(names[1]).toBe('Beta')
    expect(names[2]).toBe('Zebra')
  })

  it('returns empty object for empty spec array', () => {
    expect(groupSpecsByCategory([])).toEqual({})
  })
})

describe('Missing spec handling (N/A)', () => {
  it('fills N/A when a product has no value for a spec', () => {
    const { matrix } = buildComparisonMatrix([productA, productB], allSpecs)
    // Product B has no Weight spec
    expect(matrix['Dimensions']['Weight']['p2']).toBe('N/A')
  })

  it('shows actual value when spec is present', () => {
    const { matrix } = buildComparisonMatrix([productA, productB], allSpecs)
    expect(matrix['Dimensions']['Weight']['p1']).toBe('1.2kg')
  })

  it('fills N/A for all specs when product has no specs at all', () => {
    const { matrix } = buildComparisonMatrix([productA, productC], specsA)
    // productC has no specs — all values should be N/A
    for (const { group, name } of Object.values(matrix).flatMap(g =>
      Object.keys(g).map(n => ({ group: Object.keys(matrix).find(k => matrix[k][n]) ?? '', name: n })),
    )) {
      if (group) expect(matrix[group][name]['p3']).toBe('N/A')
    }
  })
})

describe('Comparison matrix generation', () => {
  it('builds matrix with correct products', () => {
    const { products } = buildComparisonMatrix([productA, productB], allSpecs)
    expect(products).toHaveLength(2)
    expect(products.map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('includes all unique spec keys across products', () => {
    const { specKeyOrder } = buildComparisonMatrix([productA, productB], allSpecs)
    const names = specKeyOrder.map(s => s.name)
    expect(names).toContain('Color')
    expect(names).toContain('Weight')
    expect(names).toContain('CPU')
  })

  it('deduplicates spec keys that appear in multiple products', () => {
    const { specKeyOrder } = buildComparisonMatrix([productA, productB], allSpecs)
    // Color appears in both products but should only be one entry
    const colorCount = specKeyOrder.filter(s => s.name === 'Color').length
    expect(colorCount).toBe(1)
  })

  it('matrix groups match expected spec groups', () => {
    const { matrix } = buildComparisonMatrix([productA, productB], allSpecs)
    expect(Object.keys(matrix)).toEqual(expect.arrayContaining(['General', 'Technical', 'Dimensions']))
  })
})

describe('Spec display order', () => {
  it('orders specKeyOrder by displayOrder ascending', () => {
    const specs: ProductSpec[] = [
      { id: 'o1', productId: 'p1', specName: 'Z-Spec', specValue: 'z', specGroup: 'General', displayOrder: 10 },
      { id: 'o2', productId: 'p1', specName: 'A-Spec', specValue: 'a', specGroup: 'General', displayOrder: 1 },
    ]
    const { specKeyOrder } = buildComparisonMatrix([productA], specs)
    expect(specKeyOrder[0].name).toBe('A-Spec')
    expect(specKeyOrder[1].name).toBe('Z-Spec')
  })

  it('uses alphabetical order as tie-breaker when displayOrder is equal', () => {
    const specs: ProductSpec[] = [
      { id: 't1', productId: 'p1', specName: 'Zebra', specValue: 'z', specGroup: 'General', displayOrder: 5 },
      { id: 't2', productId: 'p1', specName: 'Apple', specValue: 'a', specGroup: 'General', displayOrder: 5 },
    ]
    const { specKeyOrder } = buildComparisonMatrix([productA], specs)
    expect(specKeyOrder[0].name).toBe('Apple')
    expect(specKeyOrder[1].name).toBe('Zebra')
  })
})

describe('Export format validation', () => {
  it('accepts csv as a valid export format', () => {
    expect(validateExportFormat('csv')).toBe(true)
  })

  it('accepts pdf as a valid export format', () => {
    expect(validateExportFormat('pdf')).toBe(true)
  })

  it('rejects unknown export formats', () => {
    expect(validateExportFormat('xlsx')).toBe(false)
    expect(validateExportFormat('docx')).toBe(false)
    expect(validateExportFormat('')).toBe(false)
  })

  it('generates valid CSV with header and price row', () => {
    const { matrix, specKeyOrder } = buildComparisonMatrix([productA, productB], allSpecs)
    const csv = exportComparisonToCSV([productA, productB], matrix, specKeyOrder)
    const lines = csv.split('\n')
    // First line is header
    expect(lines[0]).toContain('Spec Group')
    expect(lines[0]).toContain('Product A')
    expect(lines[0]).toContain('Product B')
    // Second line is price row
    expect(lines[1]).toContain('Price')
    expect(lines[1]).toContain('100000')
    expect(lines[1]).toContain('200000')
  })

  it('CSV rows match specKeyOrder length + 2 (header + price)', () => {
    const { matrix, specKeyOrder } = buildComparisonMatrix([productA, productB], allSpecs)
    const csv = exportComparisonToCSV([productA, productB], matrix, specKeyOrder)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(specKeyOrder.length + 2)
  })
})
