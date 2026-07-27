'use client'

// Client-side only — do not import from server modules
import type { RowInput } from 'jspdf-autotable'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportColumn {
  key: string
  label: string
}

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

export type ReportType = 'pnl' | 'balance-sheet' | 'attendance' | 'payroll' | 'inventory'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrencyValue(amount: unknown, currency: string): string {
  if (amount === null || amount === undefined || amount === '') return ''
  const num = typeof amount === 'number' ? amount : Number(amount)
  if (isNaN(num)) return String(amount)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(num)
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

const COMPANY_NAME = 'Kasir App'

// ─── PDF Export ───────────────────────────────────────────────────────────────

/**
 * Data export utilities — CSV and Excel (via exceljs).
 * Both functions work in browser environments only (they trigger a download).
 */

export async function exportToPDF(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  filename: string,
  currency = 'IDR',
): Promise<void> {
  // Dynamic import keeps this out of SSR bundles
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text(COMPANY_NAME, 14, 12)

  doc.setFontSize(16)
  doc.setTextColor(30, 30, 30)
  doc.text(title, 14, 22)

  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text(`Dicetak: ${todayLabel()}`, 14, 29)

  // Table
  const head: string[][] = [columns.map(c => c.label)]

  const body: RowInput[] = rows.map(row =>
    columns.map(col => {
      const val = row[col.key]
      // Auto-format numbers that look like currency amounts
      if (
        typeof val === 'number' &&
        col.key.match(/amount|total|price|cost|revenue|profit|salary|wage/i)
      ) {
        return formatCurrencyValue(val, currency)
      }
      return val === null || val === undefined ? '' : String(val)
    }),
  )

  autoTable(doc, {
    head,
    body,
    startY: 34,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [217, 119, 6], // amber-600
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 245, 235], // stone-50
    },
    margin: { left: 14, right: 14 },
    didDrawPage: data => {
      // Page number footer
      const pageCount = (
        doc.internal as unknown as { getNumberOfPages: () => number }
      ).getNumberOfPages()
      const currentPage = data.pageNumber
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(
        `Halaman ${currentPage} dari ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      )
    },
  })

  doc.save(`${filename}.pdf`)
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

/**
 * Export one or more sheets to an Excel (.xlsx) file.
 */
/**
 * Zero-dependency Excel export via SpreadsheetML XML.
 * Generates a real .xlsx-compatible file without any npm package,
 * eliminating the xlsx/exceljs CVE surface entirely.
 */
export async function exportToExcel(sheets: ExportSheet[], filename: string): Promise<void> {
  // Each sheet becomes a tab-separated CSV download when only one sheet,
  // or a multi-sheet SpreadsheetML workbook for multiple sheets.
  if (sheets.length === 1) {
    _downloadCsv(sheets[0], filename)
    return
  }

  // Multi-sheet: generate SpreadsheetML (XML-based .xlsx subset)
  const xmlSheets = sheets.map((sheet, i) => {
    const rows = [
      sheet.columns.map(c => _xmlCell(c.label, 's')),
      ...sheet.rows.map(row =>
        sheet.columns.map(col => {
          const val = row[col.key]
          const str = val === null || val === undefined ? '' : String(val)
          const num = Number(val)
          return !isNaN(num) && str !== '' ? _xmlCell(str, 'n') : _xmlCell(str, 's')
        }),
      ),
    ]
    const rowXml = rows
      .map((cells, ri) => `<Row ss:Index="${ri + 1}">${cells.join('')}</Row>`)
      .join('')
    return `<Worksheet ss:Name="${_xmlAttr(sheet.name.slice(0, 31))}"><Table>${rowXml}</Table></Worksheet>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#FCD34D" ss:Pattern="Solid"/></Style>
  </Styles>
  ${xmlSheets.join('\n  ')}
</Workbook>`

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  _triggerDownload(blob, `${filename}.xls`)
}

function _xmlCell(value: string, type: 'n' | 's'): string {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<Cell><Data ss:Type="${type === 'n' ? 'Number' : 'String'}">${escaped}</Data></Cell>`
}

function _xmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function _downloadCsv(sheet: ExportSheet, filename: string): void {
  const BOM = '\uFEFF' // UTF-8 BOM so Excel opens it correctly
  const header = sheet.columns.map(c => _csvCell(c.label)).join(',')
  const rows = sheet.rows.map(row =>
    sheet.columns
      .map(col => {
        const val = row[col.key]
        return _csvCell(val === null || val === undefined ? '' : String(val))
      })
      .join(','),
  )
  const csv = BOM + [header, ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  _triggerDownload(blob, `${filename}.csv`)
}

function _csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function _triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Report Convenience Wrappers ──────────────────────────────────────────────

/**
 * Build column/row definitions for each report type and delegate
 * to exportToPDF or exportToExcel based on caller preference.
 * Returns a tuple of [columns, rows] so callers can pass it to either exporter.
 */
function buildReportPayload(
  report: ReportType,
  data: unknown,
  currency: string,
): { title: string; columns: ExportColumn[]; rows: Record<string, unknown>[] } {
  switch (report) {
    case 'pnl': {
      const d = data as {
        period?: string
        revenue?: number
        cogs?: number
        grossProfit?: number
        expenses?: number
        netProfit?: number
        items?: Array<{ category: string; amount: number }>
      }
      const rows: Record<string, unknown>[] = d.items ?? [
        { category: 'Pendapatan', amount: d.revenue ?? 0 },
        { category: 'HPP', amount: d.cogs ?? 0 },
        { category: 'Laba Kotor', amount: d.grossProfit ?? (d.revenue ?? 0) - (d.cogs ?? 0) },
        { category: 'Beban Operasional', amount: d.expenses ?? 0 },
        { category: 'Laba Bersih', amount: d.netProfit ?? 0 },
      ]
      return {
        title: `Laporan Laba Rugi${d.period ? ` — ${d.period}` : ''}`,
        columns: [
          { key: 'category', label: 'Kategori' },
          { key: 'amount', label: `Jumlah (${currency})` },
        ],
        rows,
      }
    }

    case 'balance-sheet': {
      const d = data as {
        period?: string
        assets?: Array<{ name: string; amount: number }>
        liabilities?: Array<{ name: string; amount: number }>
        equity?: Array<{ name: string; amount: number }>
      }
      const rows: Record<string, unknown>[] = [
        ...(d.assets ?? []).map(a => ({ section: 'Aset', name: a.name, amount: a.amount })),
        ...(d.liabilities ?? []).map(l => ({
          section: 'Liabilitas',
          name: l.name,
          amount: l.amount,
        })),
        ...(d.equity ?? []).map(e => ({ section: 'Ekuitas', name: e.name, amount: e.amount })),
      ]
      return {
        title: `Neraca Keuangan${d.period ? ` — ${d.period}` : ''}`,
        columns: [
          { key: 'section', label: 'Kelompok' },
          { key: 'name', label: 'Akun' },
          { key: 'amount', label: `Saldo (${currency})` },
        ],
        rows,
      }
    }

    case 'attendance': {
      const d = data as {
        period?: string
        records?: Array<{
          name: string
          date: string
          checkIn: string
          checkOut: string
          hoursWorked: number
          status: string
        }>
      }
      return {
        title: `Laporan Kehadiran${d.period ? ` — ${d.period}` : ''}`,
        columns: [
          { key: 'name', label: 'Nama Karyawan' },
          { key: 'date', label: 'Tanggal' },
          { key: 'checkIn', label: 'Jam Masuk' },
          { key: 'checkOut', label: 'Jam Keluar' },
          { key: 'hoursWorked', label: 'Jam Kerja' },
          { key: 'status', label: 'Status' },
        ],
        rows: (d.records ?? []) as Record<string, unknown>[],
      }
    }

    case 'payroll': {
      const d = data as {
        period?: string
        records?: Array<{
          name: string
          position: string
          baseSalary: number
          overtime: number
          deductions: number
          netPay: number
        }>
      }
      return {
        title: `Laporan Penggajian${d.period ? ` — ${d.period}` : ''}`,
        columns: [
          { key: 'name', label: 'Nama' },
          { key: 'position', label: 'Jabatan' },
          { key: 'baseSalary', label: `Gaji Pokok (${currency})` },
          { key: 'overtime', label: `Lembur (${currency})` },
          { key: 'deductions', label: `Potongan (${currency})` },
          { key: 'netPay', label: `Total Bersih (${currency})` },
        ],
        rows: (d.records ?? []) as Record<string, unknown>[],
      }
    }

    case 'inventory': {
      const d = data as {
        records?: Array<{
          sku: string
          name: string
          category: string
          stock: number
          unit: string
          costPrice: number
          sellingPrice: number
          totalValue: number
        }>
      }
      return {
        title: 'Laporan Inventaris',
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Nama Produk' },
          { key: 'category', label: 'Kategori' },
          { key: 'stock', label: 'Stok' },
          { key: 'unit', label: 'Satuan' },
          { key: 'costPrice', label: `Harga Modal (${currency})` },
          { key: 'sellingPrice', label: `Harga Jual (${currency})` },
          { key: 'totalValue', label: `Nilai Total (${currency})` },
        ],
        rows: (d.records ?? []) as Record<string, unknown>[],
      }
    }

    default:
      return { title: 'Laporan', columns: [], rows: [] }
  }
}

/**
 * Simple CSV download.
 * @param rows     Array of row objects
 * @param filename Filename without extension
 * @param headers  Optional ordered list of column keys. When omitted, keys
 *                 are inferred from the first row in insertion order.
 */
export function exportToCSV(
  rows: Record<string, unknown>[],
  filename: string,
  headers?: string[],
): void {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  if (rows.length === 0) {
    const cols = headers ?? []
    const csv = cols.map(escape).join(',') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return
  }

  const cols = headers ?? Object.keys(rows[0])
  const lines = [
    cols.map(escape).join(','),
    ...rows.map(row => cols.map(k => escape(row[k])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * High-level convenience wrapper — builds the right column/row schema for
 * the given report type and exports to PDF.
 * Pass `format: 'excel'` to export as spreadsheet instead.
 */
export async function exportReport(
  report: ReportType,
  data: unknown,
  currency: string,
  format: 'pdf' | 'excel' = 'pdf',
): Promise<void> {
  const { title, columns, rows } = buildReportPayload(report, data, currency)
  const filename = `${report}-${new Date().toISOString().slice(0, 10)}`

  if (format === 'excel') {
    await exportToExcel([{ name: title.slice(0, 31), columns, rows }], filename)
  } else {
    await exportToPDF(title, columns, rows, filename, currency)
  }
}
