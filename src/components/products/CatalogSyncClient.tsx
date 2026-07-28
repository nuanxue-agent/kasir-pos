'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, Download, RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle, Loader2, X, Link } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseAndValidateCSV,
  findDuplicateSKUs,
  computeImportSummary,
  CSV_HEADERS,
  type ParsedRow,
  type ImportSummary,
} from '@/lib/product-import'

// ── Types ─────────────────────────────────────────────────────────────────────

type ExternalSource = 'TOKOPEDIA' | 'SHOPEE' | 'MANUAL'

interface SyncMapping {
  id: string
  storeId: string
  externalSource: ExternalSource
  externalId: string
  productId: string
  productName?: string
  productSku?: string
  lastSyncAt: string | null
  active: boolean
}

interface Product {
  id: string
  name: string
  sku?: string
  price: number
}

interface CatalogSyncClientProps {
  storeId: string
  initialMappings: SyncMapping[]
  products: Product[]
  existingSKUs: Set<string>
}

type Tab = 'import' | 'export' | 'sync'
type ImportStep = 1 | 2 | 3

const SOURCE_LABELS: Record<ExternalSource, string> = {
  TOKOPEDIA: 'Tokopedia',
  SHOPEE: 'Shopee',
  MANUAL: 'Manual',
}

const SOURCE_COLORS: Record<ExternalSource, string> = {
  TOKOPEDIA: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  SHOPEE: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  MANUAL: 'bg-[var(--color-muted)]/20 text-[var(--color-fg-muted)]',
}

// ── CSV Export helper ─────────────────────────────────────────────────────────

function triggerCSVDownload(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: ExternalSource }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', SOURCE_COLORS[source])}>
      {SOURCE_LABELS[source]}
    </span>
  )
}

// ── Import Tab ────────────────────────────────────────────────────────────────

function ImportTab({
  storeId,
  existingSKUs,
}: {
  storeId: string
  existingSKUs: Set<string>
}) {
  const [step, setStep] = useState<ImportStep>(1)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [duplicateSKUs, setDuplicateSKUs] = useState<Set<string>>(new Set())
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    if (!file.name.endsWith('.csv')) {
      setFileError('Please upload a .csv file')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseAndValidateCSV(text)
      if (parsed.length === 0) {
        setFileError('CSV contains no data rows')
        return
      }
      const dupes = findDuplicateSKUs(parsed)
      const s = computeImportSummary(parsed, existingSKUs)
      setRows(parsed)
      setDuplicateSKUs(dupes)
      setSummary(s)
      setStep(2)
    }
    reader.readAsText(file)
  }

  const handleConfirm = async () => {
    const validRows = rows.filter(r => r.errors.length === 0)
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/catalog-sync/import?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: validRows.map(r => ({
            name: r.data.name,
            sku: r.data.sku,
            price: r.data.price ?? 0,
            cost: r.data.cost ?? 0,
            stock: r.data.stock ?? 0,
            categoryName: r.data.categoryName,
          })),
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) {
        setSubmitError(data.error ?? 'Import failed')
        return
      }
      setResult({ created: data.created, updated: data.updated, errors: data.errors?.length ?? 0 })
      setStep(3)
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reset = () => {
    setStep(1)
    setRows([])
    setSummary(null)
    setDuplicateSKUs(new Set())
    setFileName('')
    setFileError('')
    setSubmitError('')
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const downloadTemplate = () => {
    const csv = CSV_HEADERS.join(',') + '\r\nContoh Produk,SKU001,15000,8000,50,Makanan'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    triggerCSVDownload(url)
    URL.revokeObjectURL(url)
  }

  // Step 1 — Upload
  if (step === 1) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--color-fg)]">Import Produk dari CSV</h3>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"
        >
          <Download className="w-3.5 h-3.5" />
          Unduh Template
        </button>
      </div>
      <label className={cn(
        'flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-10 cursor-pointer transition-colors',
        'border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5',
        fileError && 'border-[var(--color-danger)]',
      )}>
        <Upload className="w-8 h-8 text-[var(--color-fg-muted)]" />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {fileName || 'Klik untuk memilih file CSV'}
          </p>
          <p className="text-xs text-[var(--color-fg-muted)] mt-1">Hanya file .csv yang didukung</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
      </label>
      {fileError && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-danger)]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {fileError}
        </p>
      )}
    </div>
  )

  // Step 2 — Preview
  if (step === 2) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--color-fg)]">Preview Import — {fileName}</h3>
        <button onClick={reset} className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          Ganti File
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Akan Dibuat', value: summary.toCreate, color: 'text-[var(--color-success)]' },
            { label: 'Akan Diperbarui', value: summary.toUpdate, color: 'text-[var(--color-warning)]' },
            { label: 'Error', value: summary.errorCount, color: 'text-[var(--color-danger)]' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg border border-[var(--color-border)] p-3 text-center">
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {duplicateSKUs.size > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 p-3">
          <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-warning)]">
            SKU duplikat terdeteksi dalam file: {[...duplicateSKUs].join(', ')}
          </p>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]">
            <tr>
              {['#', 'Nama', 'SKU', 'Harga', 'Stok', 'Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-[var(--color-fg-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(row => {
              const hasError = row.errors.length > 0
              const isDupe = row.data.sku ? duplicateSKUs.has(row.data.sku) : false
              const isExisting = row.data.sku ? existingSKUs.has(row.data.sku) : false
              return (
                <tr key={row.rowIndex} className={cn(
                  hasError ? 'bg-[var(--color-danger)]/5' : isDupe ? 'bg-[var(--color-warning)]/5' : '',
                )}>
                  <td className="px-3 py-2 text-[var(--color-fg-muted)]">{row.rowIndex}</td>
                  <td className="px-3 py-2 text-[var(--color-fg)]">{row.data.name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--color-fg-muted)]">{row.data.sku || '—'}</td>
                  <td className="px-3 py-2 text-[var(--color-fg)]">{row.data.rawPrice || '—'}</td>
                  <td className="px-3 py-2 text-[var(--color-fg)]">{row.data.rawStock || '—'}</td>
                  <td className="px-3 py-2">
                    {hasError ? (
                      <span className="text-xs text-[var(--color-danger)]">{row.errors[0].message}</span>
                    ) : isDupe ? (
                      <span className="text-xs text-[var(--color-warning)]">SKU duplikat</span>
                    ) : isExisting ? (
                      <span className="text-xs text-[var(--color-warning)]">Akan diperbarui</span>
                    ) : (
                      <span className="text-xs text-[var(--color-success)]">Baru</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {submitError && (
        <p className="text-sm text-[var(--color-danger)]">{submitError}</p>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-surface-raised)]"
        >
          Batal
        </button>
        <button
          onClick={handleConfirm}
          disabled={isSubmitting || rows.filter(r => r.errors.length === 0).length === 0}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Import {rows.filter(r => r.errors.length === 0).length} Produk
        </button>
      </div>
    </div>
  )

  // Step 3 — Done
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <CheckCircle className="w-12 h-12 text-[var(--color-success)]" />
      <h3 className="font-semibold text-[var(--color-fg)]">Import Selesai</h3>
      {result && (
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {[
            { label: 'Dibuat', value: result.created, color: 'text-[var(--color-success)]' },
            { label: 'Diperbarui', value: result.updated, color: 'text-[var(--color-warning)]' },
            { label: 'Gagal', value: result.errors, color: 'text-[var(--color-danger)]' },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-[var(--color-border)] p-3 text-center">
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
      >
        Import Lagi
      </button>
    </div>
  )
}

// ── Export Tab ────────────────────────────────────────────────────────────────

function ExportTab({ storeId }: { storeId: string }) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch(`/api/catalog-sync/export?storeId=${storeId}`)
      if (!res.ok) {
        const data = (await res.json()) as any
        setError(data.error ?? 'Export gagal')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      triggerCSVDownload(url)
      URL.revokeObjectURL(url)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Network error. Coba lagi.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-[var(--color-fg)]">Export Produk ke CSV</h3>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Download semua produk aktif di toko ini dalam format CSV. File dapat dibuka di Excel atau Google Sheets.
      </p>
      <div className="rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-surface-raised)]">
        <p className="text-xs font-medium text-[var(--color-fg-muted)] mb-2">Kolom yang diekspor:</p>
        <div className="flex flex-wrap gap-2">
          {['name', 'sku', 'price', 'cost', 'stock', 'categoryName'].map(col => (
            <span key={col} className="px-2 py-0.5 rounded bg-[var(--color-muted)]/20 text-xs font-mono text-[var(--color-fg-muted)]">
              {col}
            </span>
          ))}
        </div>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-danger)]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-success)]">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          File berhasil diunduh
        </p>
      )}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {isExporting ? 'Mengexport...' : 'Export CSV'}
      </button>
    </div>
  )
}

// ── Sync Mappings Tab ─────────────────────────────────────────────────────────

function SyncTab({
  storeId,
  initialMappings,
  products,
}: {
  storeId: string
  initialMappings: SyncMapping[]
  products: Product[]
}) {
  const [mappings, setMappings] = useState<SyncMapping[]>(initialMappings)
  const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formSource, setFormSource] = useState<ExternalSource>('TOKOPEDIA')
  const [formExternalId, setFormExternalId] = useState('')
  const [formProductId, setFormProductId] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/catalog-sync?storeId=${storeId}`)
      if (res.ok) {
        const data = (await res.json()) as any
        setMappings(data as SyncMapping[])
      }
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  const handleAddMapping = async () => {
    setFormError('')
    if (!formExternalId.trim()) { setFormError('External ID wajib diisi'); return }
    if (!formProductId) { setFormError('Pilih produk terlebih dahulu'); return }
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/catalog-sync?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalSource: formSource, externalId: formExternalId.trim(), productId: formProductId }),
      })
      const data = (await res.json()) as any
      if (!res.ok) { setFormError(data.error ?? 'Gagal menyimpan mapping'); return }
      setShowForm(false)
      setFormExternalId('')
      setFormProductId('')
      await reload()
    } catch {
      setFormError('Network error. Coba lagi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--color-fg)]">Sinkronisasi Katalog</h3>
        <div className="flex gap-2">
          <button
            onClick={reload}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Mapping
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3 bg-[var(--color-surface-raised)]">
          <h4 className="text-sm font-medium text-[var(--color-fg)]">Mapping Baru</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Sumber</label>
              <select
                value={formSource}
                onChange={e => setFormSource(e.target.value as ExternalSource)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-fg)]"
              >
                {(['TOKOPEDIA', 'SHOPEE', 'MANUAL'] as ExternalSource[]).map(s => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">External ID / SKU</label>
              <input
                value={formExternalId}
                onChange={e => setFormExternalId(e.target.value)}
                placeholder="mis. TOK-001"
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">Produk Internal</label>
              <select
                value={formProductId}
                onChange={e => setFormProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-fg)]"
              >
                <option value="">-- Pilih Produk --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                ))}
              </select>
            </div>
          </div>
          {formError && <p className="text-sm text-[var(--color-danger)]">{formError}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setFormError('') }}
              className="px-3 py-1.5 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-surface-raised)]"
            >
              Batal
            </button>
            <button
              onClick={handleAddMapping}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Link className="w-10 h-10 text-[var(--color-fg-muted)]" />
          <p className="text-sm text-[var(--color-fg-muted)]">Belum ada mapping katalog. Tambah mapping untuk menghubungkan SKU eksternal ke produk internal.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]">
              <tr>
                {['Sumber', 'External ID', 'Produk Internal', 'Terakhir Sync', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-[var(--color-fg-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {mappings.map(m => (
                <tr key={m.id} className="hover:bg-[var(--color-surface-raised)]">
                  <td className="px-3 py-2.5"><SourceBadge source={m.externalSource} /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-fg-muted)]">{m.externalId}</td>
                  <td className="px-3 py-2.5 text-[var(--color-fg)]">
                    {m.productName ?? m.productId}
                    {m.productSku && <span className="ml-1 text-xs text-[var(--color-fg-muted)]">({m.productSku})</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-fg-muted)]">
                    {m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleDateString('id-ID') : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      m.active
                        ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                        : 'bg-[var(--color-muted)]/20 text-[var(--color-fg-muted)]',
                    )}>
                      {m.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CatalogSyncClient({
  storeId,
  initialMappings,
  products,
  existingSKUs,
}: CatalogSyncClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('import')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'import', label: 'Import', icon: <Upload className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
    { id: 'sync', label: 'Sync Mapping', icon: <RefreshCw className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-fg)]">Katalog Sinkronisasi</h1>
        <p className="text-sm text-[var(--color-fg-muted)] mt-1">
          Import/export produk dan kelola mapping SKU eksternal (Tokopedia, Shopee, Manual).
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        {activeTab === 'import' && (
          <ImportTab storeId={storeId} existingSKUs={existingSKUs} />
        )}
        {activeTab === 'export' && (
          <ExportTab storeId={storeId} />
        )}
        {activeTab === 'sync' && (
          <SyncTab storeId={storeId} initialMappings={initialMappings} products={products} />
        )}
      </div>
    </div>
  )
}
