// ─── Variant utilities ────────────────────────────────────────────────────────

export interface VariantAttribute {
  name: string // e.g. 'Ukuran'
  values: string // comma-separated, e.g. 'S, M, L, XL'
}

export interface VariantCombination {
  key: string // e.g. 'S-Merah'
  labels: string[] // e.g. ['S', 'Merah']
  skuSuffix: string
  priceAdj: number
  stock: number
}

/** Generate all combinations from attribute value arrays */
export function generateCombinations(attributes: VariantAttribute[]): VariantCombination[] {
  const parsed = attributes
    .filter(a => a.name.trim() && a.values.trim())
    .map(a => ({
      name: a.name.trim(),
      vals: a.values
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
    }))
  if (parsed.length === 0) return []

  let combos: string[][] = [[]]
  for (const attr of parsed) {
    const next: string[][] = []
    for (const combo of combos) {
      for (const val of attr.vals) {
        next.push([...combo, val])
      }
    }
    combos = next
  }

  return combos.map(labels => {
    const key = labels.join('-')
    return {
      key,
      labels,
      skuSuffix: generateSkuSuffix(labels),
      priceAdj: 0,
      stock: 0,
    }
  })
}

/** Generate uppercase hyphen-separated SKU suffix from variant labels */
export function generateSkuSuffix(labels: string[]): string {
  return labels.map(l => l.toUpperCase().replace(/\s+/g, '')).join('-')
}

/** Calculate final price with adjustment */
export function calcFinalPrice(basePrice: number, priceAdj: number): number {
  return basePrice + priceAdj
}

/** Format cart line display name */
export function formatCartLine(productName: string, variantLabels?: string[]): string {
  if (!variantLabels || variantLabels.length === 0) return productName
  return `${productName} (${variantLabels.join(', ')})`
}
