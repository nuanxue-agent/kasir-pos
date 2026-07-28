/**
 * @module e-faktur
 * Pure business logic for Indonesian e-Faktur (electronic tax invoice).
 * No DB deps — safe to import in unit tests.
 */

export type FakturStatus = 'DRAFT' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED'

export interface FakturSeriesInput {
  prefix: string
  lastNumber: number
  year: number
  month: number
}

export interface EFakturRow {
  id: string
  storeId: string
  invoiceNumber: string
  fakturCode: string
  buyerNpwp: string
  buyerName: string
  taxBase: number
  taxAmount: number
  status: FakturStatus
  uploadedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FakturSeriesRow {
  id: string
  storeId: string
  prefix: string
  lastNumber: number
  year: number
  month: number
  createdAt: string
  updatedAt: string
}

/**
 * Generate a DJP-compliant faktur number.
 * Format: 010.000-YY.XXXXXXXX
 *   010     = transaction code (taxable domestic)
 *   000     = status code
 *   YY      = 2-digit year
 *   XXXXXXXX = 8-digit sequential number (zero-padded)
 */
export function generateFakturNumber(
  sequential: number,
  year: number,
  transactionCode = '010',
  statusCode = '000',
): string {
  const yy = String(year).slice(-2)
  const seq = String(sequential).padStart(8, '0')
  return `${transactionCode}.${statusCode}-${yy}.${seq}`
}

/**
 * Calculate PPN tax base from a gross amount (inclusive of 11% PPN).
 * taxBase = grossAmount / 1.11
 */
export function calcTaxBaseFromGross(grossAmount: number): number {
  return Math.round((grossAmount / 1.11) * 100) / 100
}

/**
 * Calculate tax base directly from a net amount.
 * (DJP: taxable base is the selling price before PPN.)
 */
export function calcTaxBase(netAmount: number): number {
  return Math.round(netAmount * 100) / 100
}

/**
 * Calculate PPN 11% from a tax base amount.
 */
export function calcPPN(taxBase: number): number {
  return Math.round(taxBase * 0.11 * 100) / 100
}

/**
 * Calculate PPN 11% rate — always 0.11.
 */
export const PPN_RATE = 0.11

/**
 * Increment a faktur series — returns the next sequential number.
 */
export function nextSeriesNumber(series: FakturSeriesInput): number {
  return series.lastNumber + 1
}

/**
 * Determine if a series belongs to the given year/month.
 * If not, a new series should be started.
 */
export function seriesMatchesPeriod(
  series: FakturSeriesInput,
  year: number,
  month: number,
): boolean {
  return series.year === year && series.month === month
}

/**
 * Format a single EFaktur row as a DJP CSV line.
 * Column order follows the official DJP Online CSV format.
 *
 * FK|fakturCode|invoiceDate|taxBase|taxAmount|buyerNpwp|buyerName
 */
export function formatCsvRow(row: {
  fakturCode: string
  invoiceNumber: string
  createdAt: string
  taxBase: number
  taxAmount: number
  buyerNpwp: string
  buyerName: string
}): string {
  const date = row.createdAt.slice(0, 10).replace(/-/g, '/')
  const fields = [
    'FK',
    row.fakturCode,
    date,
    String(Math.round(row.taxBase)),
    String(Math.round(row.taxAmount)),
    row.buyerNpwp,
    row.buyerName,
  ]
  return fields.join(',')
}

/**
 * Build the full DJP CSV export string from an array of EFaktur rows.
 * Includes the mandatory header line.
 */
export function buildDjpCsv(rows: Parameters<typeof formatCsvRow>[0][]): string {
  const header = 'JENIS_FAKTUR,KODE_FAKTUR,TANGGAL,DPP,PPN,NPWP_PEMBELI,NAMA_PEMBELI'
  const lines = rows.map(formatCsvRow)
  return [header, ...lines].join('\n')
}

/**
 * Validate NPWP format: 15 digits, optionally formatted as XX.XXX.XXX.X-XXX.XXX
 */
export function isValidNpwp(npwp: string): boolean {
  const digits = npwp.replace(/[.\-]/g, '')
  return /^\d{15}$/.test(digits)
}

/**
 * Format NPWP to display format: XX.XXX.XXX.X-XXX.XXX
 */
export function formatNpwp(npwp: string): string {
  const d = npwp.replace(/[.\-]/g, '')
  if (d.length !== 15) return npwp
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12)}`
}
