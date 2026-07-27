// ─── Product Import Utilities ─────────────────────────────────────────────────
// Pure TypeScript — no browser APIs, safe for both server and client.

export interface ParsedProduct {
  name: string
  price: number | null
  cost: number | null
  sku: string
  categoryName: string
  stock: number | null
  // raw values for display
  rawPrice: string
  rawCost: string
  rawStock: string
}

export interface ValidationError {
  row: number
  field: string
  message: string
}

export interface ParsedRow {
  data: ParsedProduct
  errors: ValidationError[]
  rowIndex: number
}

export interface ImportSummary {
  toCreate: number
  toUpdate: number
  errorCount: number
}

// CSV template column headers
export const CSV_HEADERS = ['name', 'sku', 'price', 'cost', 'stock', 'categoryName'] as const

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a raw CSV string into an array of record objects.
 * Handles quoted fields with embedded commas and newlines.
 */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = splitCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Parse a price string that may be formatted as IDR:
 * "Rp 15.000" → 15000, "15000" → 15000, "15,000.50" → 15000.50
 */
export function parseIDRPrice(raw: string): number | null {
  if (!raw || raw.trim() === '') return null
  // Strip currency symbols and whitespace
  let cleaned = raw.trim().replace(/^Rp\.?\s*/i, '')
  // If the string uses dots as thousands separators and comma as decimal (ID format)
  // detect: digits.digits.digits,digits → ID format
  const idFormat = /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)
  if (idFormat) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // Western format: remove commas as thousand separators
    cleaned = cleaned.replace(/,/g, '')
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

/**
 * Validate a single parsed row, returning structured errors.
 */
export function validateRow(raw: Record<string, string>, rowIndex: number): ParsedRow {
  const errors: ValidationError[] = []

  const name = (raw['name'] ?? '').trim()
  if (!name) {
    errors.push({ row: rowIndex, field: 'name', message: 'Name is required' })
  }

  const rawPrice = raw['price'] ?? ''
  const price = parseIDRPrice(rawPrice)
  if (rawPrice.trim() === '') {
    errors.push({ row: rowIndex, field: 'price', message: 'Price is required' })
  } else if (price === null || price < 0) {
    errors.push({ row: rowIndex, field: 'price', message: `Invalid price: "${rawPrice}"` })
  }

  const rawCost = raw['cost'] ?? ''
  const cost = rawCost.trim() === '' ? 0 : parseIDRPrice(rawCost)
  if (rawCost.trim() !== '' && (cost === null || cost < 0)) {
    errors.push({ row: rowIndex, field: 'cost', message: `Invalid cost: "${rawCost}"` })
  }

  const rawStock = raw['stock'] ?? ''
  let stock: number | null = null
  if (rawStock.trim() !== '') {
    const n = parseInt(rawStock, 10)
    if (isNaN(n) || n < 0) {
      errors.push({ row: rowIndex, field: 'stock', message: `Invalid stock: "${rawStock}"` })
    } else {
      stock = n
    }
  }

  return {
    rowIndex,
    errors,
    data: {
      name,
      price,
      cost: cost ?? 0,
      sku: (raw['sku'] ?? '').trim(),
      categoryName: (raw['categoryname'] ?? raw['categoryName'] ?? raw['category'] ?? '').trim(),
      stock,
      rawPrice,
      rawCost,
      rawStock,
    },
  }
}

/**
 * Parse a full CSV string and validate every row.
 */
export function parseAndValidateCSV(csv: string): ParsedRow[] {
  const rawRows = parseCSV(csv)
  return rawRows.map((raw, idx) => validateRow(raw, idx + 1))
}

/**
 * Detect duplicate SKUs within a parsed batch.
 * Returns a Set of SKUs that appear more than once.
 */
export function findDuplicateSKUs(rows: ParsedRow[]): Set<string> {
  const seen = new Map<string, number>()
  const dupes = new Set<string>()
  for (const row of rows) {
    const sku = row.data.sku
    if (!sku) continue
    seen.set(sku, (seen.get(sku) ?? 0) + 1)
    if ((seen.get(sku) ?? 0) > 1) dupes.add(sku)
  }
  return dupes
}

/**
 * Compute import summary given existing SKUs in the store.
 */
export function computeImportSummary(rows: ParsedRow[], existingSKUs: Set<string>): ImportSummary {
  let toCreate = 0
  let toUpdate = 0
  let errorCount = 0

  for (const row of rows) {
    if (row.errors.length > 0) {
      errorCount++
      continue
    }
    if (row.data.sku && existingSKUs.has(row.data.sku)) {
      toUpdate++
    } else {
      toCreate++
    }
  }

  return { toCreate, toUpdate, errorCount }
}
