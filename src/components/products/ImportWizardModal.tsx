'use client'

import { useState, useRef } from 'react'
import { X, Upload, Download, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseAndValidateCSV,
  findDuplicateSKUs,
  computeImportSummary,
  CSV_HEADERS,
  type ParsedRow,
  type ImportSummary,
} from '@/lib/product-import'

interface ImportWizardModalProps {
  storeId: string
  existingSKUs: Set<string>
  onClose: () => void
  onSuccess: (result: { created: number; updated: number; errors: number }) => void
}

type Step = 1 | 2 | 3

export default function ImportWizardModal({
  storeId,
  existingSKUs,
  onClose,
  onSuccess,
}: ImportWizardModalProps) {
  const [step, setStep] = useState<Step>(1)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [duplicateSKUs, setDuplicateSKUs] = useState<Set<string>>(new Set())
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Step 1: file upload ────────────────────────────────────────────────────

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
    }
    reader.readAsText(file)
  }

  const handleDownloadTemplate = () => {
    const csvContent =
      CSV_HEADERS.join(',') +
      '\n' +
      'Kopi Arabica,SKU-001,25000,15000,100,Minuman\n' +
      'Teh Hijau,SKU-002,18000,10000,50,Minuman\n'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'product_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Step 3: confirm & submit ───────────────────────────────────────────────

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setSubmitError('')
    const validRows = rows.filter(r => r.errors.length === 0)
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.map(r => r.data) }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({ error: 'Import failed' }))) as any
        throw new Error(e.error ?? 'Import failed')
      }
      const result = (await res.json()) as { created: number; updated: number; errors: number }
      onSuccess(result)
    } catch (err: any) {
      setSubmitError(err.message ?? 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const stepLabel = ['Upload CSV', 'Preview', 'Confirm']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Import Produk</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Upload CSV untuk membuat atau memperbarui produk
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-stone-100 px-6 py-3">
          {stepLabel.map((label, i) => {
            const n = (i + 1) as Step
            const active = step === n
            const done = step > n
            return (
              <div key={n} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                          ? 'bg-amber-500 text-white'
                          : 'bg-stone-100 text-stone-400',
                    )}
                  >
                    {done ? '✓' : n}
                  </div>
                  <span
                    className={cn(
                      'text-sm',
                      active ? 'font-medium text-stone-800' : 'text-stone-400',
                    )}
                  >
                    {label}
                  </span>
                </div>
                {i < stepLabel.length - 1 && (
                  <ChevronRight className="mx-3 h-4 w-4 text-stone-300" />
                )}
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-200 py-12 transition-colors hover:border-amber-400 hover:bg-amber-50/30"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f && fileRef.current) {
                    const dt = new DataTransfer()
                    dt.items.add(f)
                    fileRef.current.files = dt.files
                    fileRef.current.dispatchEvent(new Event('change', { bubbles: true }))
                  }
                }}
              >
                <Upload className="h-8 w-8 text-stone-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-stone-600">
                    {fileName ? fileName : 'Klik atau drag & drop file CSV'}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">Hanya .csv yang didukung</p>
                </div>
                {fileName && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {rows.length} baris ditemukan
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              {fileError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {fileError}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-lg bg-stone-50 px-4 py-3">
                <div className="flex-1 text-sm text-stone-600">
                  Belum punya template? Download dulu.
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-amber-400 hover:text-amber-600"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Template
                </button>
              </div>
              <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
                <strong>Kolom yang didukung:</strong> {CSV_HEADERS.join(', ')}. SKU digunakan untuk
                mencocokkan produk yang sudah ada.
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone-600">
                  Menampilkan <strong>{rows.length}</strong> baris dari file{' '}
                  <span className="font-medium text-stone-800">{fileName}</span>
                </p>
                {summary && summary.errorCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {summary.errorCount} baris dengan error (akan dilewati)
                  </div>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-stone-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-left">
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        #
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        Nama
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        SKU
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        Harga
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        HPP
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        Stok
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        Kategori
                      </th>
                      <th className="px-3 py-2 font-semibold tracking-wide text-stone-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {rows.map(row => {
                      const hasError = row.errors.length > 0
                      const isDupe = row.data.sku ? duplicateSKUs.has(row.data.sku) : false
                      const willUpdate = row.data.sku ? existingSKUs.has(row.data.sku) : false
                      return (
                        <tr
                          key={row.rowIndex}
                          className={cn(
                            'transition-colors',
                            hasError || isDupe
                              ? 'bg-red-50'
                              : willUpdate
                                ? 'bg-amber-50/40'
                                : 'hover:bg-stone-50/60',
                          )}
                        >
                          <td className="px-3 py-2 text-stone-400">{row.rowIndex}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'font-medium',
                                row.errors.some(e => e.field === 'name')
                                  ? 'text-red-600'
                                  : 'text-stone-800',
                              )}
                            >
                              {row.data.name || <span className="text-red-400 italic">kosong</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {isDupe ? (
                              <span className="text-red-600">{row.data.sku} ⚠ duplikat</span>
                            ) : (
                              row.data.sku || <span className="text-stone-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                row.errors.some(e => e.field === 'price')
                                  ? 'text-red-600'
                                  : 'text-stone-700',
                              )}
                            >
                              {row.data.rawPrice || (
                                <span className="text-stone-300 italic">—</span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {row.data.rawCost || <span className="text-stone-300 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {row.data.rawStock || <span className="text-stone-300 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {row.data.categoryName || (
                              <span className="text-stone-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasError || isDupe ? (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                                Error
                              </span>
                            ) : willUpdate ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                                Update
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                                Baru
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Error detail */}
              {rows.some(r => r.errors.length > 0) && (
                <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-red-700">Detail error:</p>
                  {rows.flatMap(r =>
                    r.errors.map((e, ei) => (
                      <p key={`${r.rowIndex}-${ei}`} className="text-xs text-red-600">
                        Baris {e.row}: {e.field} — {e.message}
                      </p>
                    )),
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && summary && (
            <div className="space-y-5">
              <p className="text-sm text-stone-600">
                Ringkasan import dari <strong>{fileName}</strong>:
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
                  <p className="text-3xl font-bold text-emerald-700">{summary.toCreate}</p>
                  <p className="mt-1 text-xs font-medium text-emerald-600">Produk baru</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
                  <p className="text-3xl font-bold text-amber-700">{summary.toUpdate}</p>
                  <p className="mt-1 text-xs font-medium text-amber-600">Diperbarui</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-center">
                  <p className="text-3xl font-bold text-red-700">{summary.errorCount}</p>
                  <p className="mt-1 text-xs font-medium text-red-600">Dilewati (error)</p>
                </div>
              </div>
              {summary.toCreate + summary.toUpdate === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Tidak ada produk yang bisa diimport. Periksa kembali file CSV Anda.
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  Klik <strong>Konfirmasi Import</strong> untuk melanjutkan.
                  {summary.errorCount > 0 && ' Baris dengan error akan diabaikan.'}
                </div>
              )}
              {submitError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep(s => (s - 1) as Step))}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            {step === 1 ? 'Batal' : '← Kembali'}
          </button>

          <div className="flex items-center gap-3">
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && rows.length === 0}
                onClick={() => setStep(s => (s + 1) as Step)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Lanjut →
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting || !summary || summary.toCreate + summary.toUpdate === 0}
                onClick={handleConfirm}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? 'Mengimport…' : 'Konfirmasi Import'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
