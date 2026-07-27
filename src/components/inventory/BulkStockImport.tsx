'use client'

import { useRef, useState } from 'react'
import { Upload, Download, X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface BulkImportRow {
  sku: string
  name: string
  adjustment: number
  note?: string
  // result fields
  status?: 'ok' | 'error' | 'pending'
  message?: string
}

interface Props {
  storeId: string
  onComplete: () => void
  onClose: () => void
}

const TEMPLATE_CSV = `sku,adjustment,note
SKU-001,10,Restock from supplier
SKU-002,-5,Damaged goods
SKU-003,25,New delivery
`

export default function BulkStockImport({ storeId, onComplete, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BulkImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function parseCSV(text: string): BulkImportRow[] {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map(h => h.trim())
    const skuIdx = header.indexOf('sku')
    const adjIdx = header.indexOf('adjustment')
    const noteIdx = header.indexOf('note')

    if (skuIdx === -1 || adjIdx === -1) {
      toast.error('Format CSV salah', 'CSV harus memiliki kolom "sku" dan "adjustment"')
      return []
    }

    return lines
      .slice(1)
      .filter(l => l.trim())
      .map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        const adj = parseInt(cols[adjIdx] ?? '0', 10)
        return {
          sku: cols[skuIdx] ?? '',
          name: '',
          adjustment: isNaN(adj) ? 0 : adj,
          note: noteIdx >= 0 ? cols[noteIdx] : undefined,
          status: 'pending' as const,
        }
      })
      .filter(r => r.sku)
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length > 0) setRows(parsed)
    }
    reader.readAsText(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
    else toast.error('Format salah', 'Pilih file .csv')
  }

  async function runImport() {
    if (rows.length === 0) return
    setLoading(true)
    const updated = [...rows]

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      try {
        const res = await fetch('/api/inventory/bulk-adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            sku: row.sku,
            adjustment: row.adjustment,
            note: row.note ?? 'Bulk import',
          }),
        })
        const data = (await res.json()) as {
          success?: boolean
          error?: string
          productName?: string
        }
        if (res.ok && data.success) {
          updated[i] = {
            ...row,
            status: 'ok',
            name: data.productName ?? row.sku,
            message: `+${row.adjustment > 0 ? '+' : ''}${row.adjustment}`,
          }
        } else {
          updated[i] = { ...row, status: 'error', message: data.error ?? 'Gagal' }
        }
      } catch {
        updated[i] = { ...row, status: 'error', message: 'Network error' }
      }
      setRows([...updated])
    }

    setLoading(false)
    setDone(true)
    const errors = updated.filter(r => r.status === 'error').length
    const ok = updated.filter(r => r.status === 'ok').length
    toast[errors > 0 ? 'error' : 'success'](`${ok} berhasil, ${errors} gagal`)
    if (errors === 0) onComplete()
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template-bulk-stok.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-1)]">Impor Stok Massal</h2>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Upload CSV dengan kolom: sku, adjustment, note
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {rows.length === 0 ? (
            <>
              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all',
                  dragOver
                    ? 'border-amber-400 bg-amber-50/50'
                    : 'border-[var(--border-mid)] hover:border-amber-300 hover:bg-[var(--bg-subtle)]',
                )}
              >
                <Upload className="mx-auto mb-3 h-8 w-8 text-[var(--text-3)]" />
                <p className="text-sm font-medium text-[var(--text-1)]">Drop file CSV di sini</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">atau klik untuk memilih file</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </div>

              {/* Download template */}
              <button
                onClick={downloadTemplate}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5 text-sm text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
              >
                <Download className="h-4 w-4" />
                Download Template CSV
              </button>
            </>
          ) : (
            <>
              {/* Preview table */}
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5">
                  <span className="text-xs font-medium text-[var(--text-2)]">
                    {rows.length} baris ditemukan
                  </span>
                  {!loading && !done && (
                    <button
                      onClick={() => setRows([])}
                      className="text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
                    >
                      Ganti file
                    </button>
                  )}
                </div>
                <div className="max-h-52 divide-y divide-[var(--border)] overflow-y-auto">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-[var(--text-1)]">{row.sku}</p>
                        {row.note && (
                          <p className="truncate text-xs text-[var(--text-3)]">{row.note}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-semibold',
                          row.adjustment >= 0 ? 'text-green-600' : 'text-red-500',
                        )}
                      >
                        {row.adjustment >= 0 ? '+' : ''}
                        {row.adjustment}
                      </span>
                      {row.status === 'ok' && (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                      )}
                      {row.status === 'error' && (
                        <div className="flex shrink-0 items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-xs text-red-500">{row.message}</span>
                        </div>
                      )}
                      {row.status === 'pending' && loading && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-3)]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              {!done ? (
                <button
                  onClick={runImport}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memproses…
                    </>
                  ) : (
                    <>Jalankan Import ({rows.length} baris)</>
                  )}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-1)] transition-all hover:bg-[var(--bg-muted)]"
                >
                  Selesai
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
